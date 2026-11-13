import { createKvBackend } from './kvdb';

const backend = createKvBackend(true);

export async function initDb(): Promise<void> {
  await backend.loadAll();
}

export const loadAll = backend.loadAll;
export const saveInvoice = backend.saveInvoice;
export const deleteInvoice = backend.deleteInvoice;
export const nextInvoiceNumber = backend.nextInvoiceNumber;
export const saveCatalogItem = backend.saveCatalogItem;
export const deleteCatalogItem = backend.deleteCatalogItem;
export const resetCatalog = backend.resetCatalog;
export const getMeta = backend.getMeta;
export const setMeta = backend.setMeta;
export const saveSettings = backend.saveSettings;
