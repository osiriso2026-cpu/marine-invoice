import type { Invoice, LineItem, Totals } from './types';

function finite(n: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** Rounds to 2 decimals, half away from zero, tolerant of binary float error. */
function round2(n: number): number {
  const v = finite(n);
  const sign = v < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(v) * 100 + 1e-9)) / 100;
}

/** qty (or hours) x unit price (or rate), rounded to 2 decimals per line. */
export function lineTotal(l: LineItem): number {
  return round2(finite(l.qty) * finite(l.unitPrice));
}

/**
 * Totals for an invoice.
 * - labor: sum of labor lines (never taxed, never marked up)
 * - parts: sum of material lines
 * - markup: markupPct of the parts subtotal
 * - taxableBase: taxable parts plus the markup that applies to them
 * - tax: taxRate of the taxable base
 * - total: labor + parts + markup + tax
 */
export function computeTotals(inv: Invoice, lines: LineItem[]): Totals {
  let labor = 0;
  let parts = 0;
  let taxableParts = 0;

  for (const l of lines) {
    const t = lineTotal(l);
    if (l.type === 'labor') {
      labor += t;
    } else {
      parts += t;
      if (l.taxable) taxableParts += t;
    }
  }

  labor = round2(labor);
  parts = round2(parts);
  taxableParts = round2(taxableParts);

  const markupPct = Math.max(0, finite(inv.markupPct));
  const taxRate = Math.max(0, finite(inv.taxRate));

  const markup = round2((parts * markupPct) / 100);
  const taxableBase = round2(taxableParts + (taxableParts * markupPct) / 100);
  const tax = round2((taxableBase * taxRate) / 100);
  const total = round2(labor + parts + markup + tax);

  return { labor, parts, markup, taxableBase, tax, total };
}

/** Formats an amount with exactly 2 decimals in the device locale, e.g. 1,297.50. */
export function money(n: number): string {
  const v = round2(n);
  try {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return v.toFixed(2);
  }
}
