import type { BankTx, Invoice, LineItem } from './types';
import { computeTotals } from './calc';

/** Minimal CSV parser handling quoted fields, commas inside quotes and CRLF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

function parseAmount(raw: string): number | null {
  let t = raw.trim().replace(/[$,\s]/g, '');
  if (!t) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1);
  }
  if (t.startsWith('-')) {
    sign = -1;
    t = t.slice(1);
  } else if (t.startsWith('+')) {
    t = t.slice(1);
  }
  const n = Number(t);
  return Number.isFinite(n) ? sign * n : null;
}

function isoDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  // Already ISO-like (YYYY-MM-DD, possibly with time)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // US style MM/DD/YYYY
  const us = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(t);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return null;
}

/** Stable id from the transaction's own content, so re-importing the same file never duplicates rows. */
export function txId(date: string, amount: number, description: string): string {
  const src = `${date}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < src.length; i++) {
    const cc = src.charCodeAt(i);
    h1 = Math.imul(h1 ^ cc, 0x1000193) >>> 0;
    h2 = (Math.imul(h2, 31) + cc) >>> 0;
  }
  return `tx-${h1.toString(36)}${h2.toString(36)}`;
}

export interface ParsedCsv {
  txs: BankTx[];
  error?: string;
}

function findCol(headers: string[], patterns: RegExp[]): number {
  for (const re of patterns) {
    const i = headers.findIndex((h) => re.test(h));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * Reads a bank transaction export (Relay and most bank CSVs).
 * Detects columns by header name; supports a single signed Amount column or separate Debit/Credit columns.
 */
export function parseBankCsv(text: string): ParsedCsv {
  const rows = parseCsv(text);
  if (rows.length < 2) return { txs: [], error: 'That file has no transaction rows. Export the CSV from Relay → Transactions → Export.' };

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const dateCol = findCol(headers, [/^(transaction\s*)?date$/, /date/]);
  const descCol = findCol(headers, [/^description$/, /description|details|merchant|counterparty|name|payee|memo/]);
  const amountCol = findCol(headers, [/^amount/, /amount/]);
  const debitCol = findCol(headers, [/debit|withdraw|money\s*out/]);
  const creditCol = findCol(headers, [/credit|deposit|money\s*in/]);
  const accountCol = findCol(headers, [/account/]);

  if (dateCol === -1 || descCol === -1 || (amountCol === -1 && debitCol === -1 && creditCol === -1)) {
    return {
      txs: [],
      error: 'Couldn\u2019t find Date, Description and Amount columns. Use the transaction CSV export from Relay.',
    };
  }

  const txs: BankTx[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const date = isoDate(cells[dateCol] ?? '');
    const description = (cells[descCol] ?? '').trim();
    let amount: number | null = null;
    if (amountCol !== -1) {
      amount = parseAmount(cells[amountCol] ?? '');
    }
    if (amount === null && (debitCol !== -1 || creditCol !== -1)) {
      const debit = debitCol !== -1 ? parseAmount(cells[debitCol] ?? '') : null;
      const credit = creditCol !== -1 ? parseAmount(cells[creditCol] ?? '') : null;
      if (debit !== null || credit !== null) amount = (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (!date || amount === null || (!description && amount === 0)) continue;
    txs.push({
      id: txId(date, amount, description),
      date,
      description,
      amount,
      account: accountCol !== -1 ? (cells[accountCol] ?? '').trim() : '',
    });
  }
  if (txs.length === 0) return { txs, error: 'No readable transactions found in that file.' };
  return { txs };
}

export interface MatchSuggestion {
  tx: BankTx;
  invoice: Invoice;
  total: number;
  reason: 'number' | 'amount';
}

/**
 * Pairs unmatched deposits with unpaid invoices.
 * An invoice number in the description (the memo customers copy) is a strong match;
 * otherwise an exact amount match is suggested when it is unambiguous.
 */
export function suggestMatches(txs: BankTx[], invoices: Invoice[], lines: LineItem[]): MatchSuggestion[] {
  const openInvoices = invoices.filter((i) => i.status !== 'paid');
  const totals = new Map<string, number>();
  for (const inv of openInvoices) {
    totals.set(inv.id, computeTotals(inv, lines.filter((l) => l.invoiceId === inv.id)).total);
  }
  const deposits = txs.filter((t) => t.amount > 0 && !t.matchedInvoiceId);
  const out: MatchSuggestion[] = [];
  const claimedInvoices = new Set<string>();

  // Pass 1: invoice number in the description.
  for (const tx of deposits) {
    const desc = tx.description.toLowerCase().replace(/[\s_]+/g, '');
    const hit = openInvoices.find((i) => !claimedInvoices.has(i.id) && desc.includes(i.number.toLowerCase().replace(/[\s_]+/g, '')));
    if (hit) {
      claimedInvoices.add(hit.id);
      out.push({ tx, invoice: hit, total: totals.get(hit.id) ?? 0, reason: 'number' });
    }
  }

  // Pass 2: exact amount, only when exactly one open invoice has that total.
  for (const tx of deposits) {
    if (out.some((m) => m.tx.id === tx.id)) continue;
    const candidates = openInvoices.filter(
      (i) => !claimedInvoices.has(i.id) && Math.abs((totals.get(i.id) ?? -1) - tx.amount) < 0.005,
    );
    if (candidates.length === 1) {
      claimedInvoices.add(candidates[0].id);
      out.push({ tx, invoice: candidates[0], total: totals.get(candidates[0].id) ?? 0, reason: 'amount' });
    }
  }
  return out;
}

export interface MonthSummary {
  month: string; // YYYY-MM
  moneyIn: number;
  moneyOut: number;
  net: number;
  count: number;
}

/** Groups transactions into per-month statement rows, newest first. */
export function monthlySummaries(txs: BankTx[]): MonthSummary[] {
  const map = new Map<string, MonthSummary>();
  for (const t of txs) {
    const month = t.date.slice(0, 7);
    const cur = map.get(month) ?? { month, moneyIn: 0, moneyOut: 0, net: 0, count: 0 };
    if (t.amount >= 0) cur.moneyIn += t.amount;
    else cur.moneyOut += -t.amount;
    cur.net += t.amount;
    cur.count += 1;
    map.set(month, cur);
  }
  return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const idx = parseInt(m[2], 10) - 1;
  return `${MONTH_NAMES[idx] ?? m[2]} ${m[1]}`;
}

function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function availableBankYears(txs: BankTx[]): string[] {
  const years = new Set<string>();
  for (const t of txs) {
    const m = /^(\d{4})-/.exec(t.date);
    if (m) years.add(m[1]);
  }
  return [...years].sort((a, b) => (a < b ? 1 : -1));
}

/** Builds a chronological Schedule C / bookkeeper CSV ledger of imported transactions and matched invoices. */
export function buildAccountingCsv(txs: BankTx[], invoices: Invoice[], year?: string): string {
  const byId = new Map<string, Invoice>();
  for (const inv of invoices) byId.set(inv.id, inv);

  const filtered = txs
    .filter((t) => !year || t.date.startsWith(`${year}-`))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.description.localeCompare(b.description)));

  const header = ['Date', 'Type', 'Description', 'Account', 'Money In', 'Money Out', 'Net Amount', 'Matched Invoice', 'Client'];
  const rows = [header.map(csvCell).join(',')];

  for (const t of filtered) {
    const inv = t.matchedInvoiceId ? byId.get(t.matchedInvoiceId) : undefined;
    const isIncome = t.amount >= 0;
    rows.push(
      [
        t.date,
        isIncome ? 'Income' : 'Expense',
        t.description,
        t.account,
        isIncome ? t.amount.toFixed(2) : '',
        isIncome ? '' : Math.abs(t.amount).toFixed(2),
        t.amount.toFixed(2),
        inv ? inv.number : '',
        inv ? inv.clientName : '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return rows.join('\r\n');
}
