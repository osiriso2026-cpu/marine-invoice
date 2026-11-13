import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Invoice, LineItem, Settings } from './types';
import { computeTotals, lineTotal, money } from './calc';

const ACCENT = '#0B6E8A';
const INK = '#10252E';
const MUTED = '#5A6E77';
const LINE = '#D3DDE1';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escaped text with line breaks preserved. */
function escMultiline(v: unknown): string {
  return esc(v).replace(/\r?\n/g, '<br/>');
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  } catch {
    return iso;
  }
}

function fmtQty(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
  } catch {
    return String(n);
  }
}

function fmtPct(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n) + '%';
  } catch {
    return `${n}%`;
  }
}

const STATUS_LABEL: Record<Invoice['status'], string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid' };

function detail(label: string, value: string): string {
  if (!value || !value.trim()) return '';
  return `<tr><td class="k">${esc(label)}</td><td class="v">${escMultiline(value)}</td></tr>`;
}

export function buildInvoiceHtml(inv: Invoice, lines: LineItem[], s: Settings): string {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const labor = sorted.filter((l) => l.type === 'labor');
  const parts = sorted.filter((l) => l.type === 'material');
  const t = computeTotals(inv, lines);

  const laborRows = labor.length
    ? labor
        .map(
          (l) => `<tr>
          <td class="desc">${escMultiline(l.description || 'Labor')}</td>
          <td class="num">${esc(fmtQty(l.qty))}</td>
          <td class="num">${esc(money(l.unitPrice))}</td>
          <td class="num">${esc(money(lineTotal(l)))}</td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="4" class="none">No labor on this invoice</td></tr>`;

  const partRows = parts.length
    ? parts
        .map(
          (l) => `<tr>
          <td class="desc">${escMultiline(l.description || 'Part')}${l.taxable ? '' : ' <span class="nt">(non-taxable)</span>'}</td>
          <td class="num">${esc(fmtQty(l.qty))}${l.unit ? ' ' + esc(l.unit) : ''}</td>
          <td class="num">${esc(money(l.unitPrice))}</td>
          <td class="num">${esc(money(lineTotal(l)))}</td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="4" class="none">No parts on this invoice</td></tr>`;

  const bizContact = [s.phone, s.email].filter((x) => x && x.trim()).map(esc).join(' &middot; ');
  const portalUrl = s.portalBaseUrl && s.portalBaseUrl.trim() ? `${s.portalBaseUrl.trim().replace(/\/+$/, '')}/pay/${inv.id}` : '';
  const paymentMethodsBlock = [
    s.zelleHandle && s.zelleHandle.trim()
      ? `<b>Zelle ($0 fee):</b> ${esc(s.zelleHandle.trim())} &middot; Memo: <b>${esc(inv.number)}</b>`
      : '',
    s.relayRoutingNumber && s.relayRoutingNumber.trim() && s.relayAccountNumber && s.relayAccountNumber.trim()
      ? `<b>ACH / Wire (${esc(s.relayBankName && s.relayBankName.trim() ? s.relayBankName.trim() : 'Relay Financial')}):</b> Routing <b>${esc(s.relayRoutingNumber.trim())}</b> &middot; Account <b>${esc(s.relayAccountNumber.trim())}</b> &middot; Memo: <b>${esc(inv.number)}</b>`
      : '',
    portalUrl ? `<b>Pay online ($0 fee):</b> ${esc(portalUrl)}` : '',
  ]
    .filter(Boolean)
    .join('<br/>');
  const paymentLine = [inv.paymentMethod && `Payment method: ${inv.paymentMethod}`, s.paymentTerms && `Terms: ${s.paymentTerms}`]
    .filter(Boolean)
    .map((x) => escMultiline(x as string))
    .join('<br/>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  @page { margin: 36px 32px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: ${INK}; font-size: 12px; line-height: 1.45; margin: 0; }
  .head { display: table; width: 100%; border-bottom: 3px solid ${ACCENT}; padding-bottom: 12px; margin-bottom: 16px; }
  .head > div { display: table-cell; vertical-align: top; }
  .biz { width: 60%; }
  .biz h1 { font-size: 20px; margin: 0 0 4px; color: ${INK}; }
  .biz p { margin: 0; color: ${MUTED}; }
  .meta { text-align: right; }
  .meta .doc { font-size: 22px; font-weight: 800; color: ${ACCENT}; letter-spacing: 1px; }
  .meta p { margin: 2px 0 0; color: ${MUTED}; }
  .meta b { color: ${INK}; }
  .status { display: inline-block; margin-top: 6px; padding: 2px 10px; border: 1px solid ${ACCENT}; border-radius: 99px; color: ${ACCENT}; font-weight: 700; font-size: 11px; text-transform: uppercase; }
  .cols { display: table; width: 100%; table-layout: fixed; margin-bottom: 16px; }
  .cols > div { display: table-cell; vertical-align: top; width: 50%; padding-right: 12px; }
  .cols > div + div { padding-right: 0; padding-left: 12px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: ${ACCENT}; margin: 0 0 6px; }
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv td { padding: 2px 0; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
  td.k { width: 38%; color: ${MUTED}; padding-right: 8px; }
  td.v { font-weight: 600; }
  .job { margin: 0 0 16px; padding: 10px 12px; border: 1px solid ${LINE}; border-radius: 6px; }
  .job p { margin: 0; word-wrap: break-word; overflow-wrap: anywhere; }
  table.items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 8px; }
  table.items th { text-align: left; background: #EAF3F6; color: ${INK}; font-size: 11px; padding: 6px 8px; border-bottom: 1px solid ${LINE}; }
  table.items th.num, table.items td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.items td { padding: 6px 8px; border-bottom: 1px solid ${LINE}; vertical-align: top; }
  table.items td.desc { word-wrap: break-word; overflow-wrap: anywhere; }
  table.items col.c1 { width: 46%; } table.items col.c2 { width: 16%; } table.items col.c3 { width: 18%; } table.items col.c4 { width: 20%; }
  td.none { color: ${MUTED}; font-style: italic; }
  .nt { color: ${MUTED}; font-size: 10px; }
  .sub { text-align: right; font-weight: 700; margin: 0 8px 18px 0; font-variant-numeric: tabular-nums; }
  .totals { width: 55%; margin-left: 45%; border-collapse: collapse; margin-bottom: 18px; page-break-inside: avoid; }
  .totals td { padding: 4px 8px; font-variant-numeric: tabular-nums; }
  .totals td.r { text-align: right; }
  .totals tr.grand td { border-top: 2px solid ${INK}; font-size: 16px; font-weight: 800; padding-top: 8px; }
  .totals .small { color: ${MUTED}; font-size: 10px; }
  .notes { border-top: 1px solid ${LINE}; padding-top: 10px; margin-top: 4px; page-break-inside: avoid; }
  .notes p { margin: 0 0 8px; word-wrap: break-word; overflow-wrap: anywhere; }
  .foot { margin-top: 20px; color: ${MUTED}; font-size: 10px; text-align: center; }
</style>
</head>
<body>
  <div class="head">
    <div class="biz">
      <h1>${esc(s.businessName || 'Marine repair')}</h1>
      ${s.address ? `<p>${escMultiline(s.address)}</p>` : ''}
      ${bizContact ? `<p>${bizContact}</p>` : ''}
      ${s.licenseNo ? `<p><b>License #:</b> ${esc(s.licenseNo)}</p>` : ''}
    </div>
    <div class="meta">
      <div class="doc">INVOICE</div>
      <p><b>${esc(inv.number)}</b></p>
      ${inv.workOrderNo ? `<p>Work order: <b>${esc(inv.workOrderNo)}</b></p>` : ''}
      <p>Issued: <b>${esc(fmtDate(inv.issueDate))}</b></p>
      ${inv.dueDate ? `<p>Due: <b>${esc(fmtDate(inv.dueDate))}</b></p>` : ''}
      <span class="status">${esc(STATUS_LABEL[inv.status] ?? inv.status)}</span>
    </div>
  </div>

  <div class="cols">
    <div>
      <h2>Bill to</h2>
      <table class="kv">
        ${detail('Client', inv.clientName)}
        ${detail('Contact', inv.contact)}
      </table>
    </div>
    <div>
      <h2>Vessel</h2>
      <table class="kv">
        ${detail('Boat type', inv.boatType)}
        ${detail('Make / model', inv.makeModel)}
        ${detail('Hull ID', inv.hullId)}
      </table>
    </div>
  </div>

  ${
    inv.repairDescription && inv.repairDescription.trim()
      ? `<div class="job"><h2>Repair description</h2><p>${escMultiline(inv.repairDescription)}</p></div>`
      : ''
  }

  <h2>Labor</h2>
  <table class="items">
    <colgroup><col class="c1"/><col class="c2"/><col class="c3"/><col class="c4"/></colgroup>
    <thead><tr><th>Description</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${laborRows}</tbody>
  </table>
  <div class="sub">Labor subtotal: ${esc(money(t.labor))}</div>

  <h2>Parts and materials</h2>
  <table class="items">
    <colgroup><col class="c1"/><col class="c2"/><col class="c3"/><col class="c4"/></colgroup>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
    <tbody>${partRows}</tbody>
  </table>
  <div class="sub">Parts subtotal: ${esc(money(t.parts))}</div>

  <table class="totals">
    <tr><td>Labor subtotal</td><td class="r">${esc(money(t.labor))}</td></tr>
    <tr><td>Parts subtotal</td><td class="r">${esc(money(t.parts))}</td></tr>
    <tr><td>Parts markup (${esc(fmtPct(inv.markupPct))})</td><td class="r">${esc(money(t.markup))}</td></tr>
    <tr><td>Tax (${esc(fmtPct(inv.taxRate))})<div class="small">on taxable parts: ${esc(money(t.taxableBase))}</div></td><td class="r">${esc(money(t.tax))}</td></tr>
    <tr class="grand"><td>Total</td><td class="r">${esc(money(t.total))}</td></tr>
  </table>

  <div class="notes">
    ${paymentMethodsBlock ? `<h2>How to pay ($0 fee)</h2><p>${paymentMethodsBlock}</p>` : ''}
    ${paymentLine ? `<p>${paymentLine}</p>` : ''}
    ${inv.notes && inv.notes.trim() ? `<h2>Notes</h2><p>${escMultiline(inv.notes)}</p>` : ''}
  </div>

  <div class="foot">Thank you for your business.</div>
</body>
</html>`;
}

interface PrintWindow {
  document: { open(): void; write(s: string): void; close(): void };
  focus(): void;
  print(): void;
}

interface DownloadLink {
  href: string;
  download: string;
  style: { display: string };
  click(): void;
  remove(): void;
}

interface WebGlobal {
  open?: (url: string, target: string) => PrintWindow | null;
  document?: { createElement(tag: string): DownloadLink; body: { appendChild(n: unknown): void } };
  Blob?: new (parts: string[], opts: { type: string }) => unknown;
  URL?: { createObjectURL(b: unknown): string; revokeObjectURL(u: string): void };
}

/** Web: print the invoice itself in its own window; if pop-ups are blocked, download the real invoice page. */
function shareOnWeb(html: string, number: string): string | null {
  const g = globalThis as unknown as WebGlobal;
  let w: PrintWindow | null = null;
  try {
    w = g.open ? g.open('', '_blank') : null;
  } catch {
    w = null;
  }
  if (w) {
    const win = w;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch {
        /* the person can print from the window */
      }
    }, 300);
    return null;
  }
  if (!g.document || !g.Blob || !g.URL) {
    throw new Error('Allow pop-ups for this page to print the invoice, or open it on your phone.');
  }
  const blob = new g.Blob([html], { type: 'text/html' });
  const url = g.URL.createObjectURL(blob);
  const a = g.document.createElement('a');
  a.href = url;
  a.download = `${number || 'invoice'}.html`;
  a.style.display = 'none';
  g.document.body.appendChild(a);
  a.click();
  a.remove();
  const urlApi = g.URL;
  setTimeout(() => urlApi.revokeObjectURL(url), 60000);
  return 'Downloaded the invoice page. Open it and choose Print, then Save as PDF.';
}

/** Returns a message to show when the result needs explaining, or null. */
export async function shareInvoicePdf(inv: Invoice, lines: LineItem[], s: Settings): Promise<string | null> {
  const html = buildInvoiceHtml(inv, lines, s);

  // The web preview has no file system: print the invoice from its own window instead.
  if (Platform.OS === 'web') {
    return shareOnWeb(html, inv.number);
  }

  let uri: string;
  try {
    const result = await Print.printToFileAsync({ html, base64: false });
    uri = result.uri;
    if (!uri) throw new Error('empty');
  } catch {
    throw new Error("Couldn't create the PDF. Try again.");
  }

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Invoice ${inv.number}`,
      });
    } else {
      await Print.printAsync({ uri });
    }
  } catch {
    throw new Error("The PDF was created but couldn't be shared. Try again.");
  }
  return null;
}
