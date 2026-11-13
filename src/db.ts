import * as SQLite from 'expo-sqlite';
import type {
  AppData,
  CatalogItem,
  Category,
  Invoice,
  InvoiceStatus,
  LineItem,
  LineType,
  Settings,
} from './types';
import { SEED_CATALOG, DEFAULT_SETTINGS } from './seed';

const DB_NAME = 'marine-invoice.db';
const SCHEMA_VERSION = 1;

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DB_NAME);
  }
  return dbInstance;
}

/* ---------- row types ---------- */

interface CatalogRow {
  id: string;
  category: string;
  name: string;
  unit: string;
  defaultPrice: number;
  taxable: number;
  note: string;
  isCustom: number;
}

interface InvoiceRow {
  id: string;
  number: string;
  workOrderNo: string;
  status: string;
  clientName: string;
  contact: string;
  boatType: string;
  makeModel: string;
  hullId: string;
  repairDescription: string;
  issueDate: string;
  dueDate: string;
  paymentMethod: string;
  markupPct: number;
  taxRate: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

interface LineRow {
  id: string;
  invoiceId: string;
  type: string;
  description: string;
  catalogItemId: string | null;
  qty: number;
  unit: string;
  unitPrice: number;
  taxable: number;
  sortOrder: number;
}

interface MetaRow {
  key: string;
  value: string;
}

/* ---------- helpers ---------- */

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function toCategory(v: string): Category {
  switch (v) {
    case 'resin':
    case 'reinforcement':
    case 'gelcoat':
    case 'consumable':
    case 'hardware':
      return v;
    default:
      return 'consumable';
  }
}

function toStatus(v: string): InvoiceStatus {
  return v === 'sent' || v === 'paid' ? v : 'draft';
}

function toLineType(v: string): LineType {
  return v === 'labor' ? 'labor' : 'material';
}

function catalogFromRow(r: CatalogRow): CatalogItem {
  return {
    id: r.id,
    category: toCategory(r.category),
    name: str(r.name),
    unit: str(r.unit),
    defaultPrice: num(r.defaultPrice),
    taxable: !!r.taxable,
    note: str(r.note),
    isCustom: !!r.isCustom,
  };
}

function invoiceFromRow(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    number: str(r.number),
    workOrderNo: str(r.workOrderNo),
    status: toStatus(r.status),
    clientName: str(r.clientName),
    contact: str(r.contact),
    boatType: str(r.boatType),
    makeModel: str(r.makeModel),
    hullId: str(r.hullId),
    repairDescription: str(r.repairDescription),
    issueDate: str(r.issueDate),
    dueDate: str(r.dueDate),
    paymentMethod: str(r.paymentMethod),
    markupPct: num(r.markupPct),
    taxRate: num(r.taxRate),
    notes: str(r.notes),
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
  };
}

function lineFromRow(r: LineRow): LineItem {
  const line: LineItem = {
    id: r.id,
    invoiceId: r.invoiceId,
    type: toLineType(r.type),
    description: str(r.description),
    qty: num(r.qty),
    unit: str(r.unit),
    unitPrice: num(r.unitPrice),
    taxable: !!r.taxable,
    sortOrder: num(r.sortOrder),
  };
  if (r.catalogItemId) line.catalogItemId = r.catalogItemId;
  return line;
}

const CATALOG_UPSERT_SQL = `INSERT INTO catalog (id, category, name, unit, defaultPrice, taxable, note, isCustom)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    category = excluded.category,
    name = excluded.name,
    unit = excluded.unit,
    defaultPrice = excluded.defaultPrice,
    taxable = excluded.taxable,
    note = excluded.note,
    isCustom = excluded.isCustom`;

function catalogParams(c: CatalogItem): (string | number)[] {
  return [
    c.id,
    c.category,
    c.name,
    c.unit,
    num(c.defaultPrice),
    c.taxable ? 1 : 0,
    c.note,
    c.isCustom ? 1 : 0,
  ];
}

function formatInvoiceNumber(n: number): string {
  return 'INV-' + String(n).padStart(4, '0');
}

/* ---------- init ---------- */

async function runInit(): Promise<void> {
  const db = getDb();

  const verRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = verRow ? num(verRow.user_version) : 0;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog (
        id TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        defaultPrice REAL NOT NULL DEFAULT 0,
        taxable INTEGER NOT NULL DEFAULT 1,
        note TEXT NOT NULL DEFAULT '',
        isCustom INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY NOT NULL,
        number TEXT NOT NULL,
        workOrderNo TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        clientName TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        boatType TEXT NOT NULL DEFAULT '',
        makeModel TEXT NOT NULL DEFAULT '',
        hullId TEXT NOT NULL DEFAULT '',
        repairDescription TEXT NOT NULL DEFAULT '',
        issueDate TEXT NOT NULL DEFAULT '',
        dueDate TEXT NOT NULL DEFAULT '',
        paymentMethod TEXT NOT NULL DEFAULT '',
        markupPct REAL NOT NULL DEFAULT 0,
        taxRate REAL NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL DEFAULT 0,
        updatedAt INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS lines (
        id TEXT PRIMARY KEY NOT NULL,
        invoiceId TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        catalogItemId TEXT,
        qty REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT '',
        unitPrice REAL NOT NULL DEFAULT 0,
        taxable INTEGER NOT NULL DEFAULT 1,
        sortOrder INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_lines_invoice ON lines(invoiceId, sortOrder);
      CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(createdAt);
    `);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  // Seed once: the flag stops cleared sample items from coming back.
  const seeded = await db.getFirstAsync<MetaRow>("SELECT key, value FROM meta WHERE key = 'catalogSeeded'");
  if (!seeded) {
    await db.withTransactionAsync(async () => {
      for (const item of SEED_CATALOG) {
        await db.runAsync(CATALOG_UPSERT_SQL, catalogParams(item));
      }
      await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('catalogSeeded', '1')");
    });
  }

  const settingsRow = await db.getFirstAsync<MetaRow>("SELECT key, value FROM meta WHERE key = 'settings'");
  if (!settingsRow) {
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('settings', ?)", [
      JSON.stringify(DEFAULT_SETTINGS),
    ]);
  }

  const counterRow = await db.getFirstAsync<MetaRow>(
    "SELECT key, value FROM meta WHERE key = 'nextInvoiceNumber'"
  );
  if (!counterRow) {
    // Start after the highest existing number, so numbers are never reused.
    const existing = await db.getAllAsync<{ number: string }>('SELECT number FROM invoices');
    let max = 0;
    for (const r of existing) {
      const m = /(\d+)\s*$/.exec(str(r.number));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('nextInvoiceNumber', ?)", [
      String(max + 1),
    ]);
  }
}

export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = runInit().catch((e) => {
      initPromise = null; // allow a retry after a failure
      throw e;
    });
  }
  return initPromise;
}

/* ---------- reads ---------- */

async function loadSettings(): Promise<Settings> {
  const db = getDb();
  const row = await db.getFirstAsync<MetaRow>("SELECT key, value FROM meta WHERE key = 'settings'");
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.value) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function loadAll(): Promise<AppData> {
  await initDb();
  const db = getDb();
  const settings = await loadSettings();
  const catalogRows = await db.getAllAsync<CatalogRow>('SELECT * FROM catalog ORDER BY rowid ASC');
  const invoiceRows = await db.getAllAsync<InvoiceRow>(
    'SELECT * FROM invoices ORDER BY createdAt DESC, rowid DESC'
  );
  const lineRows = await db.getAllAsync<LineRow>('SELECT * FROM lines ORDER BY invoiceId ASC, sortOrder ASC');
  return {
    settings,
    catalog: catalogRows.map(catalogFromRow),
    invoices: invoiceRows.map(invoiceFromRow),
    lines: lineRows.map(lineFromRow),
  };
}

/* ---------- invoices ---------- */

export async function saveInvoice(inv: Invoice, lines: LineItem[]): Promise<void> {
  await initDb();
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO invoices (id, number, workOrderNo, status, clientName, contact, boatType, makeModel, hullId,
         repairDescription, issueDate, dueDate, paymentMethod, markupPct, taxRate, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         number = excluded.number,
         workOrderNo = excluded.workOrderNo,
         status = excluded.status,
         clientName = excluded.clientName,
         contact = excluded.contact,
         boatType = excluded.boatType,
         makeModel = excluded.makeModel,
         hullId = excluded.hullId,
         repairDescription = excluded.repairDescription,
         issueDate = excluded.issueDate,
         dueDate = excluded.dueDate,
         paymentMethod = excluded.paymentMethod,
         markupPct = excluded.markupPct,
         taxRate = excluded.taxRate,
         notes = excluded.notes,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt`,
      [
        inv.id,
        inv.number,
        inv.workOrderNo,
        inv.status,
        inv.clientName,
        inv.contact,
        inv.boatType,
        inv.makeModel,
        inv.hullId,
        inv.repairDescription,
        inv.issueDate,
        inv.dueDate,
        inv.paymentMethod,
        num(inv.markupPct),
        num(inv.taxRate),
        inv.notes,
        num(inv.createdAt),
        num(inv.updatedAt),
      ]
    );
    await db.runAsync('DELETE FROM lines WHERE invoiceId = ?', [inv.id]);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await db.runAsync(
        `INSERT INTO lines (id, invoiceId, type, description, catalogItemId, qty, unit, unitPrice, taxable, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          l.id,
          inv.id,
          l.type,
          l.description,
          l.catalogItemId ?? null,
          num(l.qty),
          l.unit,
          num(l.unitPrice),
          l.taxable ? 1 : 0,
          i,
        ]
      );
    }
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  await initDb();
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM lines WHERE invoiceId = ?', [id]);
    await db.runAsync('DELETE FROM invoices WHERE id = ?', [id]);
  });
  // The counter is intentionally untouched: invoice numbers are never reused.
}

export async function nextInvoiceNumber(): Promise<string> {
  await initDb();
  const db = getDb();
  let n = 1;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<MetaRow>("SELECT key, value FROM meta WHERE key = 'nextInvoiceNumber'");
    const current = row ? parseInt(row.value, 10) : 1;
    n = Number.isFinite(current) && current > 0 ? current : 1;
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('nextInvoiceNumber', ?)", [String(n + 1)]);
  });
  return formatInvoiceNumber(n);
}

/* ---------- catalog ---------- */

export async function saveCatalogItem(item: CatalogItem): Promise<void> {
  await initDb();
  await getDb().runAsync(CATALOG_UPSERT_SQL, catalogParams(item));
}

export async function deleteCatalogItem(id: string): Promise<void> {
  await initDb();
  // Invoice lines keep their own copy of description, unit and price, so they stay intact.
  await getDb().runAsync('DELETE FROM catalog WHERE id = ?', [id]);
}

export async function resetCatalog(): Promise<void> {
  await initDb();
  const db = getDb();
  await db.withTransactionAsync(async () => {
    // Restore the built-in items to their defaults; the user's custom items are kept.
    await db.runAsync('DELETE FROM catalog WHERE isCustom = 0');
    for (const item of SEED_CATALOG) {
      await db.runAsync(CATALOG_UPSERT_SQL, catalogParams({ ...item, isCustom: false }));
    }
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('catalogSeeded', '1')");
  });
}

/* ---------- meta flags ---------- */

export async function getMeta(key: string): Promise<string | null> {
  await initDb();
  const row = await getDb().getFirstAsync<MetaRow>('SELECT key, value FROM meta WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await initDb();
  await getDb().runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

/* ---------- settings ---------- */

export async function saveSettings(s: Settings): Promise<void> {
  await initDb();
  await getDb().runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('settings', ?)", [JSON.stringify(s)]);
}
