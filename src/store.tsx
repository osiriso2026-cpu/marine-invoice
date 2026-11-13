import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { AppData, BankTx, CatalogItem, Invoice, LineItem, PaymentClaim, Review, Settings, Store } from './types';
import * as db from './db';
import { createKvBackend } from './kvdb';
import type { Backend } from './kvdb';
import { buildSampleInvoices } from './samples';

const MEMORY_NOTE = 'Invoices are kept in memory on this device until storage works again.';
const REVIEWS_KEY = 'reviews:v1';
const CLAIMS_KEY = 'paymentClaims:v1';
const BANK_KEY = 'bankTxs:v1';

function parseBankTxs(raw: string | null): BankTx[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as BankTx[]) : [];
  } catch {
    return [];
  }
}

function parseReviews(raw: string | null): Review[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Review[]) : [];
  } catch {
    return [];
  }
}

function parseClaims(raw: string | null): Record<string, PaymentClaim> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? (obj as Record<string, PaymentClaim>) : {};
  } catch {
    return {};
  }
}

const EMPTY_SETTINGS: Settings = {
  businessName: '',
  address: '',
  phone: '',
  email: '',
  licenseNo: '',
  defaultHourlyRate: 0,
  defaultTaxRate: 0,
  defaultMarkupPct: 0,
  paymentTerms: '',
  portalBaseUrl: '',
  zelleHandle: '',
  stripePaymentUrl: '',
  relayBankName: '',
  relayRoutingNumber: '',
  relayAccountNumber: '',
  googleReviewUrl: '',
  yelpReviewUrl: '',
  facebookReviewUrl: '',
  nextdoorReviewUrl: '',
};

const EMPTY_DATA: AppData = { settings: EMPTY_SETTINGS, catalog: [], invoices: [], lines: [] };

const sqliteBackend: Backend = {
  loadAll: db.loadAll,
  saveInvoice: db.saveInvoice,
  deleteInvoice: db.deleteInvoice,
  nextInvoiceNumber: db.nextInvoiceNumber,
  saveCatalogItem: db.saveCatalogItem,
  deleteCatalogItem: db.deleteCatalogItem,
  resetCatalog: db.resetCatalog,
  saveSettings: db.saveSettings,
  getMeta: db.getMeta,
  setMeta: db.setMeta,
};

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** SQLite on phones; AsyncStorage on the web or when SQLite cannot open. Throws only if both fail. */
async function openBackend(): Promise<Backend> {
  if (Platform.OS !== 'web') {
    try {
      await db.initDb();
      return sqliteBackend;
    } catch (e) {
      console.warn('[marine-invoice] SQLite unavailable, using AsyncStorage:', errText(e));
    }
  }
  const kv = createKvBackend(true);
  await kv.loadAll();
  return kv;
}

async function seedSamples(b: Backend): Promise<void> {
  if (await b.getMeta('samplesSeeded')) return;
  const existing = await b.loadAll();
  if (existing.invoices.length === 0) {
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) numbers.push(await b.nextInvoiceNumber());
    for (const job of buildSampleInvoices(numbers, existing.settings.defaultHourlyRate || 85)) {
      await b.saveInvoice(job.invoice, job.lines);
    }
  }
  await b.setMeta('samplesSeeded', '1');
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dueFromTerms(terms: string, from: Date): string {
  const m = /(\d{1,3})/.exec(terms || '');
  const days = m ? parseInt(m[1], 10) : 0;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return isoDate(d);
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function byNewest(a: Invoice, b: Invoice): number {
  return b.createdAt - a.createdAt;
}

function sortData(d: AppData): AppData {
  return { ...d, invoices: [...d.invoices].sort(byNewest) };
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider(props: { children: React.ReactNode }): JSX.Element {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [paymentClaims, setPaymentClaims] = useState<Record<string, PaymentClaim>>({});
  const [bankTxs, setBankTxs] = useState<BankTx[]>([]);
  const dataRef = useRef<AppData>(EMPTY_DATA);
  const reviewsRef = useRef<Review[]>([]);
  const claimsRef = useRef<Record<string, PaymentClaim>>({});
  const bankRef = useRef<BankTx[]>([]);
  const backendRef = useRef<Backend>(createKvBackend(false));
  const queue = useRef<Promise<void>>(Promise.resolve());

  const update = useCallback((fn: (d: AppData) => AppData) => {
    const next = fn(dataRef.current);
    dataRef.current = next;
    setData(next);
  }, []);

  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(fn);
    queue.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const init = useCallback(async () => {
    let b: Backend;
    let err: string | null = null;
    try {
      b = await openBackend();
    } catch (e) {
      console.warn('[marine-invoice] storage unavailable, keeping data in memory:', errText(e));
      b = createKvBackend(false);
      err = MEMORY_NOTE;
    }
    try {
      await seedSamples(b);
    } catch (e) {
      console.warn('[marine-invoice] sample invoices not added:', errText(e));
    }
    let loaded: AppData;
    try {
      loaded = await b.loadAll();
    } catch (e) {
      console.warn('[marine-invoice] load failed, keeping data in memory:', errText(e));
      b = createKvBackend(false);
      err = MEMORY_NOTE;
      await seedSamples(b).catch(() => undefined);
      loaded = await b.loadAll();
    }
    backendRef.current = b;
    const sorted = sortData(loaded);
    dataRef.current = sorted;
    setData(sorted);
    try {
      const loadedReviews = parseReviews(await b.getMeta(REVIEWS_KEY));
      const loadedClaims = parseClaims(await b.getMeta(CLAIMS_KEY));
      const loadedBank = parseBankTxs(await b.getMeta(BANK_KEY));
      reviewsRef.current = loadedReviews;
      claimsRef.current = loadedClaims;
      bankRef.current = loadedBank;
      setReviews(loadedReviews);
      setPaymentClaims(loadedClaims);
      setBankTxs(loadedBank);
    } catch (e) {
      console.warn('[marine-invoice] reviews/claims not loaded:', errText(e));
    }
    setStorageError(err);
    setReady(true);
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  const createInvoice = useCallback(
    () =>
      enqueue(async () => {
        const b = backendRef.current;
        const number = await b.nextInvoiceNumber();
        const s = dataRef.current.settings;
        const now = new Date();
        const inv: Invoice = {
          id: newId(),
          number,
          workOrderNo: '',
          status: 'draft',
          clientName: '',
          contact: '',
          boatType: '',
          makeModel: '',
          hullId: '',
          repairDescription: '',
          issueDate: isoDate(now),
          dueDate: dueFromTerms(s.paymentTerms, now),
          paymentMethod: '',
          markupPct: s.defaultMarkupPct,
          taxRate: s.defaultTaxRate,
          notes: '',
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
        };
        await b.saveInvoice(inv, []);
        update((d) => ({ ...d, invoices: [inv, ...d.invoices].sort(byNewest) }));
        return inv;
      }),
    [enqueue, update],
  );

  const saveInvoice = useCallback(
    (inv: Invoice, lines: LineItem[]) => {
      const stamped: Invoice = { ...inv, updatedAt: Date.now() };
      const mine = lines.map((l, i) => ({ ...l, invoiceId: inv.id, sortOrder: i }));
      update((d) => {
        const exists = d.invoices.some((x) => x.id === inv.id);
        const invoices = exists ? d.invoices.map((x) => (x.id === inv.id ? stamped : x)) : [stamped, ...d.invoices];
        return {
          ...d,
          invoices: invoices.sort(byNewest),
          lines: [...d.lines.filter((l) => l.invoiceId !== inv.id), ...mine],
        };
      });
      return enqueue(() => backendRef.current.saveInvoice(stamped, mine));
    },
    [enqueue, update],
  );

  const deleteInvoice = useCallback(
    (id: string) => {
      update((d) => ({
        ...d,
        invoices: d.invoices.filter((x) => x.id !== id),
        lines: d.lines.filter((l) => l.invoiceId !== id),
      }));
      return enqueue(() => backendRef.current.deleteInvoice(id));
    },
    [enqueue, update],
  );

  const saveCatalogItem = useCallback(
    (item: CatalogItem) => {
      update((d) => {
        const exists = d.catalog.some((c) => c.id === item.id);
        return { ...d, catalog: exists ? d.catalog.map((c) => (c.id === item.id ? item : c)) : [...d.catalog, item] };
      });
      return enqueue(() => backendRef.current.saveCatalogItem(item));
    },
    [enqueue, update],
  );

  const deleteCatalogItem = useCallback(
    (id: string) => {
      // Invoice lines keep their own description, unit and price, so they stay intact.
      update((d) => ({ ...d, catalog: d.catalog.filter((c) => c.id !== id) }));
      return enqueue(() => backendRef.current.deleteCatalogItem(id));
    },
    [enqueue, update],
  );

  const resetCatalog = useCallback(
    () =>
      enqueue(async () => {
        const b = backendRef.current;
        await b.resetCatalog();
        const loaded = await b.loadAll();
        update((d) => ({ ...d, catalog: loaded.catalog }));
      }),
    [enqueue, update],
  );

  const saveSettings = useCallback(
    (s: Settings) => {
      update((d) => ({ ...d, settings: s }));
      return enqueue(() => backendRef.current.saveSettings(s));
    },
    [enqueue, update],
  );

  const saveReview = useCallback(
    (r: Review) => {
      const next = [...reviewsRef.current.filter((x) => x.id !== r.id), r];
      reviewsRef.current = next;
      setReviews(next);
      return enqueue(() => backendRef.current.setMeta(REVIEWS_KEY, JSON.stringify(next)));
    },
    [enqueue],
  );

  const claimPayment = useCallback(
    (invoiceId: string, method: string) => {
      const next = { ...claimsRef.current, [invoiceId]: { method, claimedAt: Date.now() } };
      claimsRef.current = next;
      setPaymentClaims(next);
      return enqueue(() => backendRef.current.setMeta(CLAIMS_KEY, JSON.stringify(next)));
    },
    [enqueue],
  );

  const importBankTxs = useCallback(
    (incoming: BankTx[]) => {
      const existing = new Set(bankRef.current.map((t) => t.id));
      const fresh = incoming.filter((t) => !existing.has(t.id));
      const next = [...bankRef.current, ...fresh].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      bankRef.current = next;
      setBankTxs(next);
      return enqueue(async () => {
        await backendRef.current.setMeta(BANK_KEY, JSON.stringify(next));
        return { added: fresh.length, skipped: incoming.length - fresh.length };
      });
    },
    [enqueue],
  );

  const linkBankTx = useCallback(
    (txId: string, invoiceId: string | null) => {
      const next = bankRef.current.map((t) =>
        t.id === txId ? { ...t, matchedInvoiceId: invoiceId ?? undefined } : t,
      );
      bankRef.current = next;
      setBankTxs(next);
      return enqueue(async () => {
        await backendRef.current.setMeta(BANK_KEY, JSON.stringify(next));
      }).then(async () => {
        if (!invoiceId) return;
        const inv = dataRef.current.invoices.find((i) => i.id === invoiceId);
        if (!inv || inv.status === 'paid') return;
        const invLines = dataRef.current.lines.filter((l) => l.invoiceId === invoiceId);
        await saveInvoice({ ...inv, status: 'paid', paymentMethod: inv.paymentMethod || 'Bank transfer' }, invLines);
      });
    },
    [enqueue, saveInvoice],
  );

  const retryStorage = useCallback(
    () =>
      enqueue(async () => {
        try {
          const b = await openBackend();
          const cur = dataRef.current;
          await b.saveSettings(cur.settings);
          for (const item of cur.catalog) await b.saveCatalogItem(item);
          for (const inv of cur.invoices) {
            await b.saveInvoice(inv, cur.lines.filter((l) => l.invoiceId === inv.id));
          }
          await b.setMeta('samplesSeeded', '1');
          await b.setMeta(REVIEWS_KEY, JSON.stringify(reviewsRef.current));
          await b.setMeta(CLAIMS_KEY, JSON.stringify(claimsRef.current));
          await b.setMeta(BANK_KEY, JSON.stringify(bankRef.current));
          backendRef.current = b;
          const loaded = sortData(await b.loadAll());
          update(() => loaded);
          setStorageError(null);
          return true;
        } catch (e) {
          console.warn('[marine-invoice] storage still unavailable:', errText(e));
          return false;
        }
      }),
    [enqueue, update],
  );

  const dismissStorageError = useCallback(() => setStorageError(null), []);

  const value = useMemo<Store>(
    () => ({
      ready,
      data,
      reviews,
      paymentClaims,
      bankTxs,
      storageError,
      saveReview,
      claimPayment,
      importBankTxs,
      linkBankTx,
      retryStorage,
      dismissStorageError,
      createInvoice,
      saveInvoice,
      deleteInvoice,
      saveCatalogItem,
      deleteCatalogItem,
      resetCatalog,
      saveSettings,
    }),
    [
      ready,
      data,
      reviews,
      paymentClaims,
      bankTxs,
      storageError,
      saveReview,
      claimPayment,
      importBankTxs,
      linkBankTx,
      retryStorage,
      dismissStorageError,
      createInvoice,
      saveInvoice,
      deleteInvoice,
      saveCatalogItem,
      deleteCatalogItem,
      resetCatalog,
      saveSettings,
    ],
  );

  return <StoreContext.Provider value={value}>{props.children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
