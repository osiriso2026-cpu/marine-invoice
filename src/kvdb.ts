import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppData, CatalogItem, Invoice, LineItem, Settings } from './types';
import { DEFAULT_SETTINGS, SEED_CATALOG } from './seed';

/** The storage API the store talks to: SQLite on phones, AsyncStorage on the web, memory as a last resort. */
export interface Backend {
  loadAll(): Promise<AppData>;
  saveInvoice(inv: Invoice, lines: LineItem[]): Promise<void>;
  deleteInvoice(id: string): Promise<void>;
  nextInvoiceNumber(): Promise<string>;
  saveCatalogItem(item: CatalogItem): Promise<void>;
  deleteCatalogItem(id: string): Promise<void>;
  resetCatalog(): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

interface KvState {
  settings: Settings;
  catalog: CatalogItem[];
  invoices: Invoice[];
  lines: LineItem[];
  nextInvoiceNumber: number;
  meta: Record<string, string>;
}

const KEY = 'marine-invoice:data:v1';

function freshState(): KvState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    catalog: SEED_CATALOG.map((c) => ({ ...c })),
    invoices: [],
    lines: [],
    nextInvoiceNumber: 1,
    meta: {},
  };
}

function formatInvoiceNumber(n: number): string {
  return 'INV-' + String(n).padStart(4, '0');
}

export function createKvBackend(persist: boolean): Backend {
  let state: KvState | null = null;

  const load = async (): Promise<KvState> => {
    if (state) return state;
    const base = freshState();
    if (!persist) {
      state = base;
      return state;
    }
    const raw = await AsyncStorage.getItem(KEY);
    let parsed: Partial<KvState> | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Partial<KvState>;
      } catch {
        parsed = null;
      }
    }
    const mergedSettings: Settings = { ...DEFAULT_SETTINGS, ...(parsed?.settings ?? {}) };
    if (!mergedSettings.portalBaseUrl) {
      mergedSettings.portalBaseUrl = DEFAULT_SETTINGS.portalBaseUrl;
    }
    const next: KvState = parsed
      ? {
          settings: mergedSettings,
          catalog: Array.isArray(parsed.catalog) ? parsed.catalog : base.catalog,
          invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
          lines: Array.isArray(parsed.lines) ? parsed.lines : [],
          nextInvoiceNumber:
            typeof parsed.nextInvoiceNumber === 'number' && parsed.nextInvoiceNumber > 0 ? parsed.nextInvoiceNumber : 1,
          meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
        }
      : base;
    // Writing once proves storage works before the app relies on it.
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    state = next;
    return next;
  };

  const commit = async (next: KvState): Promise<void> => {
    state = next;
    if (persist) await AsyncStorage.setItem(KEY, JSON.stringify(next));
  };

  return {
    async loadAll() {
      const s = await load();
      return {
        settings: { ...s.settings },
        catalog: s.catalog.map((c) => ({ ...c })),
        invoices: [...s.invoices].sort((a, b) => b.createdAt - a.createdAt),
        lines: [...s.lines].sort((a, b) =>
          a.invoiceId === b.invoiceId ? a.sortOrder - b.sortOrder : a.invoiceId < b.invoiceId ? -1 : 1
        ),
      };
    },
    async saveInvoice(inv, lines) {
      const s = await load();
      const mine = lines.map((l, i) => ({ ...l, invoiceId: inv.id, sortOrder: i }));
      const exists = s.invoices.some((x) => x.id === inv.id);
      await commit({
        ...s,
        invoices: exists ? s.invoices.map((x) => (x.id === inv.id ? { ...inv } : x)) : [...s.invoices, { ...inv }],
        lines: [...s.lines.filter((l) => l.invoiceId !== inv.id), ...mine],
      });
    },
    async deleteInvoice(id) {
      const s = await load();
      // The counter is untouched: invoice numbers are never reused.
      await commit({
        ...s,
        invoices: s.invoices.filter((x) => x.id !== id),
        lines: s.lines.filter((l) => l.invoiceId !== id),
      });
    },
    async nextInvoiceNumber() {
      const s = await load();
      const n = s.nextInvoiceNumber > 0 ? s.nextInvoiceNumber : 1;
      await commit({ ...s, nextInvoiceNumber: n + 1 });
      return formatInvoiceNumber(n);
    },
    async saveCatalogItem(item) {
      const s = await load();
      const exists = s.catalog.some((c) => c.id === item.id);
      await commit({
        ...s,
        catalog: exists ? s.catalog.map((c) => (c.id === item.id ? { ...item } : c)) : [...s.catalog, { ...item }],
      });
    },
    async deleteCatalogItem(id) {
      const s = await load();
      await commit({ ...s, catalog: s.catalog.filter((c) => c.id !== id) });
    },
    async resetCatalog() {
      const s = await load();
      const custom = s.catalog.filter((c) => c.isCustom);
      await commit({ ...s, catalog: [...SEED_CATALOG.map((c) => ({ ...c, isCustom: false })), ...custom] });
    },
    async saveSettings(settings) {
      const s = await load();
      await commit({ ...s, settings: { ...settings } });
    },
    async getMeta(key) {
      const s = await load();
      return Object.prototype.hasOwnProperty.call(s.meta, key) ? s.meta[key] : null;
    },
    async setMeta(key, value) {
      const s = await load();
      await commit({ ...s, meta: { ...s.meta, [key]: value } });
    },
  };
}
