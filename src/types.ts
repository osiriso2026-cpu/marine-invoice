export type Category = 'resin' | 'reinforcement' | 'gelcoat' | 'consumable' | 'hardware';
export type InvoiceStatus = 'draft' | 'sent' | 'paid';
export type LineType = 'labor' | 'material';

export interface CatalogItem { id: string; category: Category; name: string; unit: string; defaultPrice: number; taxable: boolean; note: string; isCustom: boolean; }
export interface Client { id: string; name: string; contact: string; email: string; }
export interface Settings { businessName: string; address: string; phone: string; email: string; licenseNo: string; defaultHourlyRate: number; defaultTaxRate: number; defaultMarkupPct: number; paymentTerms: string; }
export interface Invoice { id: string; number: string; workOrderNo: string; status: InvoiceStatus; clientName: string; contact: string; boatType: string; makeModel: string; hullId: string; repairDescription: string; issueDate: string; dueDate: string; paymentMethod: string; markupPct: number; taxRate: number; notes: string; createdAt: number; updatedAt: number; }
export interface LineItem { id: string; invoiceId: string; type: LineType; description: string; catalogItemId?: string; qty: number; unit: string; unitPrice: number; taxable: boolean; sortOrder: number; }
export interface Totals { labor: number; parts: number; markup: number; taxableBase: number; tax: number; total: number; }
export interface AppData { settings: Settings; catalog: CatalogItem[]; invoices: Invoice[]; lines: LineItem[]; }

export interface Store {
  ready: boolean;
  data: AppData;
  storageError: string | null;
  retryStorage(): Promise<boolean>;
  dismissStorageError(): void;
  createInvoice(): Promise<Invoice>;
  saveInvoice(inv: Invoice, lines: LineItem[]): Promise<void>;
  deleteInvoice(id: string): Promise<void>;
  saveCatalogItem(item: CatalogItem): Promise<void>;
  deleteCatalogItem(id: string): Promise<void>;
  resetCatalog(): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
}

export type RootStackParams = { Tabs: undefined; InvoiceEditor: { invoiceId: string } };
export interface EditorProps { route: { params: { invoiceId: string } }; navigation: any; }
export interface CatalogPickerProps { visible: boolean; onClose(): void; onPick(item: CatalogItem): void; }
