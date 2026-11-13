import type { Invoice, InvoiceStatus, LineItem } from './types';
import { SEED_CATALOG } from './seed';

const DAY = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface LaborSpec {
  description: string;
  hours: number;
}

interface PartSpec {
  slug: string;
  qty: number;
  taxable?: boolean;
}

interface JobSpec {
  key: string;
  ageDays: number;
  dueInDays: number;
  status: InvoiceStatus;
  clientName: string;
  contact: string;
  boatType: string;
  makeModel: string;
  hullId: string;
  workOrderNo: string;
  repairDescription: string;
  paymentMethod: string;
  notes: string;
  labor: LaborSpec[];
  parts: PartSpec[];
}

// Oldest first, so they take INV-0001, INV-0002, INV-0003 in order.
const JOBS: JobSpec[] = [
  {
    key: 'blister',
    ageDays: 38,
    dueInDays: -8,
    status: 'paid',
    clientName: 'Dana Reyes',
    contact: '(410) 555-0187',
    boatType: 'Sailboat',
    makeModel: "Catalina 34",
    hullId: 'CTY34127H596',
    workOrderNo: 'WO-1031',
    repairDescription:
      'Hull blister repair below the waterline: grind out blisters, dry the hull, fill with epoxy filler and apply an epoxy barrier coat.',
    paymentMethod: 'Check',
    notes: 'Paid in full by check #2214.',
    labor: [
      { description: 'Grind, dry and fill blisters', hours: 16 },
      { description: 'Epoxy barrier coat, 4 coats', hours: 6 },
    ],
    parts: [
      { slug: 'epoxy-kit-2gal', qty: 2 },
      { slug: 'barrier-coat-qt', qty: 6 },
      { slug: 'epoxy-filler-qt', qty: 3 },
      { slug: 'sanding-discs-80', qty: 2 },
    ],
  },
  {
    key: 'transom',
    ageDays: 30,
    dueInDays: -15,
    status: 'sent',
    clientName: 'Marcus Bell',
    contact: 'marcus.bell@example.com',
    boatType: 'Center console',
    makeModel: 'Grady-White 25',
    hullId: 'NTLAB117F203',
    workOrderNo: 'WO-1038',
    repairDescription:
      'Transom core replacement: remove the wet plywood core, rebuild with balsa core and 1708 biaxial, re-bed transom hardware.',
    paymentMethod: 'Bank transfer',
    notes: 'Owner authorized the core replacement by phone after moisture readings.',
    labor: [
      { description: 'Strip outer skin and remove wet core', hours: 18 },
      { description: 'New core, laminate and fair', hours: 22 },
    ],
    parts: [
      { slug: 'core-balsa', qty: 3 },
      { slug: 'biaxial-1708', qty: 14 },
      { slug: 'vinylester-gal', qty: 4 },
      { slug: 'mat-15oz', qty: 8 },
      { slug: 'bedding-sealant', qty: 4 },
      { slug: 'acetone-gal', qty: 1, taxable: false },
    ],
  },
  {
    key: 'gelcoat',
    ageDays: 3,
    dueInDays: 27,
    status: 'sent',
    clientName: 'Priya Nandakumar',
    contact: '(207) 555-0164',
    boatType: 'Runabout',
    makeModel: 'Boston Whaler 17 Montauk',
    hullId: 'BWCE4521K819',
    workOrderNo: 'WO-1044',
    repairDescription: 'Gelcoat colour match on a port bow gouge: grind, fill, gelcoat, wet sand and polish.',
    paymentMethod: 'Card',
    notes: '',
    labor: [{ description: 'Gouge prep, gelcoat and wet sand', hours: 4.5 }],
    parts: [
      { slug: 'gelcoat-kit', qty: 1 },
      { slug: 'fairing-qt', qty: 1 },
      { slug: 'sandpaper-pack', qty: 1 },
    ],
  },
];

export interface SampleJob {
  invoice: Invoice;
  lines: LineItem[];
}

export function buildSampleInvoices(numbers: string[], rate: number): SampleJob[] {
  const now = Date.now();
  return JOBS.map((job, i) => {
    const id = `sample-${job.key}`;
    const created = now - job.ageDays * DAY;
    const invoice: Invoice = {
      id,
      number: numbers[i] ?? `INV-${String(i + 1).padStart(4, '0')}`,
      workOrderNo: job.workOrderNo,
      status: job.status,
      clientName: job.clientName,
      contact: job.contact,
      boatType: job.boatType,
      makeModel: job.makeModel,
      hullId: job.hullId,
      repairDescription: job.repairDescription,
      issueDate: isoOffset(-job.ageDays),
      dueDate: isoOffset(job.dueInDays),
      paymentMethod: job.paymentMethod,
      markupPct: 10,
      taxRate: 6,
      notes: job.notes,
      createdAt: created,
      updatedAt: created,
    };
    const lines: LineItem[] = [];
    for (const l of job.labor) {
      const idx = lines.length;
      lines.push({
        id: `${id}-l${idx}`,
        invoiceId: id,
        type: 'labor',
        description: l.description,
        qty: l.hours,
        unit: 'hr',
        unitPrice: rate,
        taxable: false,
        sortOrder: idx,
      });
    }
    for (const p of job.parts) {
      const item = SEED_CATALOG.find((c) => c.id === `seed-${p.slug}`);
      if (!item) continue;
      const idx = lines.length;
      lines.push({
        id: `${id}-l${idx}`,
        invoiceId: id,
        type: 'material',
        description: item.name,
        catalogItemId: item.id,
        qty: p.qty,
        unit: item.unit,
        unitPrice: item.defaultPrice,
        taxable: p.taxable ?? item.taxable,
        sortOrder: idx,
      });
    }
    return { invoice, lines };
  });
}
