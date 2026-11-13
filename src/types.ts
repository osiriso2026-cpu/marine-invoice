export type Category = 'resin' | 'reinforcement' | 'gelcoat' | 'consumable' | 'hardware';
export type InvoiceStatus = 'draft' | 'sent' | 'paid';
export type LineType = 'labor' | 'material';

export interface CatalogItem { id: string; category: Category; name: string; unit: string; defaultPrice: number; taxable: boolean; note: string; isCustom: boolean; }
export interface Client { id: string; name: string; contact: string; email: string; }
export interface Settings {
  businessName: string; address: string; phone: string; email: string; licenseNo: string;
  defaultHourlyRate: number; defaultTaxRate: number; defaultMarkupPct: number; paymentTerms: string;
  /** Public web base URL where customer links live, e.g. https://pay.mobilemarinedoc.com. */
  portalBaseUrl: string;
  /** Email or phone registered with the bank's Zelle; shown as the zero-fee payment option. */
  zelleHandle: string;
  /** Stripe Payment Link for ACH bank transfers, e.g. https://buy.stripe.com/XXXX. */
  stripePaymentUrl: string;
  googleReviewUrl: string;
  yelpReviewUrl: string;
  facebookReviewUrl: string;
  nextdoorReviewUrl: string;
}

/** A review a customer left on the payment page. Private ones (1-3 stars) are only shown to the owner. */
export interface Review { id: string; invoiceId: string; rating: number; text: string; isPrivate: boolean; createdAt: number; }

/** Set when a customer taps "I sent my payment" on the customer page; cleared once the invoice is marked paid. */
export interface PaymentClaim { method: string; claimedAt: number; }

/** A transaction imported from a Relay (or other bank) CSV export. */
export interface BankTx { id: string; date: string; description: string; amount: number; account: string; matchedInvoiceId?: string; }
export interface Invoice { id: string; number: string; workOrderNo: string; status: InvoiceStatus; clientName: string; contact: string; boatType: string; makeModel: string; hullId: string; repairDescription: string; issueDate: string; dueDate: string; paymentMethod: string; markupPct: number; taxRate: number; notes: string; createdAt: number; updatedAt: number; }
export interface LineItem { id: string; invoiceId: string; type: LineType; description: string; catalogItemId?: string; qty: number; unit: string; unitPrice: number; taxable: boolean; sortOrder: number; }
export interface Totals { labor: number; parts: number; markup: number; taxableBase: number; tax: number; total: number; }
export interface AppData { settings: Settings; catalog: CatalogItem[]; invoices: Invoice[]; lines: LineItem[]; }

export interface Store {
  ready: boolean;
  data: AppData;
  reviews: Review[];
  paymentClaims: Record<string, PaymentClaim>;
  bankTxs: BankTx[];
  storageError: string | null;
  saveReview(r: Review): Promise<void>;
  claimPayment(invoiceId: string, method: string): Promise<void>;
  /** Merges imported transactions, skipping ones already present. */
  importBankTxs(txs: BankTx[]): Promise<{ added: number; skipped: number }>;
  /** Links a deposit to an invoice and marks that invoice paid; pass null to unlink (invoice status is untouched). */
  linkBankTx(txId: string, invoiceId: string | null): Promise<void>;
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

export type RootStackParams = { Tabs: undefined; InvoiceEditor: { invoiceId: string }; CustomerPortal: { invoiceId: string } };
export interface EditorProps { route: { params: { invoiceId: string } }; navigation: any; }
export interface CatalogPickerProps { visible: boolean; onClose(): void; onPick(item: CatalogItem): void; }
