import { Platform } from 'react-native';
import type { Invoice, LineItem, PaymentClaim, Review, Settings } from './types';

/**
 * Compact snapshot embedded in `?d=` query parameter so customer links work
 * across any device immediately with zero database required, while also
 * supporting live Supabase REST sync when `supabaseUrl` + `supabaseAnonKey` are configured.
 */
export interface PortalSnapshot {
  v: 1;
  inv: Invoice;
  lines: LineItem[];
  biz: {
    businessName: string;
    address: string;
    phone: string;
    email: string;
    paymentTerms: string;
    zelleHandle: string;
    stripePaymentUrl: string;
    relayBankName: string;
    relayRoutingNumber: string;
    relayAccountNumber: string;
    googleReviewUrl: string;
    yelpReviewUrl: string;
    facebookReviewUrl: string;
    nextdoorReviewUrl: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
}

function toBase64Url(str: string): string {
  try {
    const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    );
    const b64 =
      typeof btoa === 'function'
        ? btoa(utf8)
        : Buffer.from(str, 'utf-8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function fromBase64Url(b64url: string): string | null {
  try {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const binary =
      typeof atob === 'function'
        ? atob(b64 + pad)
        : Buffer.from(b64 + pad, 'base64').toString('binary');
    const percentEncoded = Array.from(binary)
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('');
    return decodeURIComponent(percentEncoded);
  } catch {
    return null;
  }
}

export function encodePortalSnapshot(inv: Invoice, lines: LineItem[], s: Settings): string {
  const snap: PortalSnapshot = {
    v: 1,
    inv,
    lines,
    biz: {
      businessName: s.businessName,
      address: s.address,
      phone: s.phone,
      email: s.email,
      paymentTerms: s.paymentTerms,
      zelleHandle: s.zelleHandle,
      stripePaymentUrl: s.stripePaymentUrl,
      relayBankName: s.relayBankName,
      relayRoutingNumber: s.relayRoutingNumber,
      relayAccountNumber: s.relayAccountNumber,
      googleReviewUrl: s.googleReviewUrl,
      yelpReviewUrl: s.yelpReviewUrl,
      facebookReviewUrl: s.facebookReviewUrl,
      nextdoorReviewUrl: s.nextdoorReviewUrl,
      ...(s.supabaseUrl.trim() && s.supabaseAnonKey.trim()
        ? { supabaseUrl: s.supabaseUrl.trim(), supabaseAnonKey: s.supabaseAnonKey.trim() }
        : {}),
    },
  };
  return toBase64Url(JSON.stringify(snap));
}

export function decodePortalSnapshot(raw?: string | null): PortalSnapshot | null {
  let token = raw ? raw.trim() : '';
  if (!token && Platform.OS === 'web') {
    const loc = (globalThis as { location?: { search?: string; hash?: string } }).location;
    const search = loc?.search || '';
    const m = /[?&]d=([^&#]+)/.exec(search) || /[?&]d=([^&#]+)/.exec(loc?.hash || '');
    if (m) {
      try {
        token = decodeURIComponent(m[1]);
      } catch {
        token = m[1];
      }
    }
  }
  if (!token) return null;
  const json = fromBase64Url(token);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as PortalSnapshot;
    if (parsed && parsed.inv && Array.isArray(parsed.lines) && parsed.biz) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildCustomerPortalUrl(inv: Invoice, lines: LineItem[], s: Settings): string {
  const configured = s.portalBaseUrl.trim().replace(/\/+$/, '');
  let base = configured;
  if (!base && Platform.OS === 'web') {
    const loc = (globalThis as { location?: { origin?: string; pathname?: string } }).location;
    if (loc?.origin) {
      const pathPrefix = (loc.pathname || '').replace(/\/(edit|pay)\/.*$/, '').replace(/\/+$/, '');
      base = `${loc.origin.replace(/\/+$/, '')}${pathPrefix}`;
    }
  }
  if (!base) {
    base = 'https://pay.mobilemarinedoc.com';
  }
  const encoded = encodePortalSnapshot(inv, lines, s);
  return encoded ? `${base}/pay/${inv.id}?d=${encoded}` : `${base}/pay/${inv.id}`;
}

/* ---------- Optional Supabase Cloud Sync ---------- */

export function hasSupabaseConfig(s: { supabaseUrl?: string; supabaseAnonKey?: string }): boolean {
  return Boolean(s.supabaseUrl && s.supabaseUrl.trim() && s.supabaseAnonKey && s.supabaseAnonKey.trim());
}

function supabaseHeaders(anonKey: string, prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: anonKey.trim(),
    Authorization: `Bearer ${anonKey.trim()}`,
    'Content-Type': 'application/json',
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

function cleanUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Pushes an invoice snapshot to Supabase `portal_invoices` if configured. */
export async function syncInvoiceToCloud(inv: Invoice, lines: LineItem[], s: Settings): Promise<boolean> {
  if (!hasSupabaseConfig(s)) return false;
  const snap: PortalSnapshot = {
    v: 1,
    inv,
    lines,
    biz: {
      businessName: s.businessName,
      address: s.address,
      phone: s.phone,
      email: s.email,
      paymentTerms: s.paymentTerms,
      zelleHandle: s.zelleHandle,
      stripePaymentUrl: s.stripePaymentUrl,
      relayBankName: s.relayBankName,
      relayRoutingNumber: s.relayRoutingNumber,
      relayAccountNumber: s.relayAccountNumber,
      googleReviewUrl: s.googleReviewUrl,
      yelpReviewUrl: s.yelpReviewUrl,
      facebookReviewUrl: s.facebookReviewUrl,
      nextdoorReviewUrl: s.nextdoorReviewUrl,
    },
  };
  try {
    const res = await fetch(`${cleanUrl(s.supabaseUrl)}/rest/v1/portal_invoices`, {
      method: 'POST',
      headers: supabaseHeaders(s.supabaseAnonKey, 'resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        snapshot: snap,
        updated_at: inv.updatedAt,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetches an invoice snapshot from Supabase `portal_invoices` if configured. */
export async function fetchInvoiceFromCloud(
  invoiceId: string,
  cfg: { supabaseUrl?: string; supabaseAnonKey?: string },
): Promise<PortalSnapshot | null> {
  if (!hasSupabaseConfig(cfg)) return null;
  try {
    const url = `${cleanUrl(cfg.supabaseUrl!)}/rest/v1/portal_invoices?id=eq.${encodeURIComponent(invoiceId)}&select=snapshot`;
    const res = await fetch(url, { headers: supabaseHeaders(cfg.supabaseAnonKey!) });
    if (!res.ok) return null;
    const rows = (await res.json()) as { snapshot?: PortalSnapshot }[];
    return rows[0]?.snapshot ?? null;
  } catch {
    return null;
  }
}

/** Pushes a customer payment claim ("I sent my Zelle / ACH payment") to Supabase if configured. */
export async function pushClaimToCloud(
  invoiceId: string,
  claim: PaymentClaim,
  cfg: { supabaseUrl?: string; supabaseAnonKey?: string },
): Promise<boolean> {
  if (!hasSupabaseConfig(cfg)) return false;
  try {
    const res = await fetch(`${cleanUrl(cfg.supabaseUrl!)}/rest/v1/portal_claims`, {
      method: 'POST',
      headers: supabaseHeaders(cfg.supabaseAnonKey!, 'resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify({
        invoice_id: invoiceId,
        method: claim.method,
        claimed_at: claim.claimedAt,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pushes a customer review/feedback to Supabase if configured. */
export async function pushReviewToCloud(
  review: Review,
  cfg: { supabaseUrl?: string; supabaseAnonKey?: string },
): Promise<boolean> {
  if (!hasSupabaseConfig(cfg)) return false;
  try {
    const res = await fetch(`${cleanUrl(cfg.supabaseUrl!)}/rest/v1/portal_reviews`, {
      method: 'POST',
      headers: supabaseHeaders(cfg.supabaseAnonKey!, 'resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify({
        id: review.id,
        invoice_id: review.invoiceId,
        rating: review.rating,
        text: review.text,
        is_private: review.isPrivate,
        created_at: review.createdAt,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pulls all customer payment claims and reviews from Supabase into the owner's app. */
export async function pullCustomerActivityFromCloud(cfg: {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}): Promise<{ claims: Record<string, PaymentClaim>; reviews: Review[] } | null> {
  if (!hasSupabaseConfig(cfg)) return null;
  try {
    const base = cleanUrl(cfg.supabaseUrl!);
    const headers = supabaseHeaders(cfg.supabaseAnonKey!);
    const [claimsRes, reviewsRes] = await Promise.all([
      fetch(`${base}/rest/v1/portal_claims?select=invoice_id,method,claimed_at`, { headers }),
      fetch(`${base}/rest/v1/portal_reviews?select=id,invoice_id,rating,text,is_private,created_at`, { headers }),
    ]);
    if (!claimsRes.ok || !reviewsRes.ok) return null;
    const claimRows = (await claimsRes.json()) as { invoice_id: string; method: string; claimed_at: number }[];
    const reviewRows = (await reviewsRes.json()) as {
      id: string;
      invoice_id: string;
      rating: number;
      text: string;
      is_private: boolean;
      created_at: number;
    }[];
    const claims: Record<string, PaymentClaim> = {};
    for (const r of claimRows) {
      if (r.invoice_id) claims[r.invoice_id] = { method: r.method, claimedAt: Number(r.claimed_at) || Date.now() };
    }
    const reviews: Review[] = reviewRows.map((r) => ({
      id: r.id,
      invoiceId: r.invoice_id,
      rating: Number(r.rating) || 5,
      text: r.text || '',
      isPrivate: Boolean(r.is_private),
      createdAt: Number(r.created_at) || Date.now(),
    }));
    return { claims, reviews };
  } catch {
    return null;
  }
}

/** SQL schema snippet shown in Settings so the owner can enable Supabase anytime in 1 paste. */
export const SUPABASE_SETUP_SQL = `-- Optional: Run once in Supabase SQL Editor to enable live two-way sync
create table if not exists public.portal_invoices (
  id text primary key,
  number text not null,
  status text not null,
  snapshot jsonb not null,
  updated_at bigint not null
);
create table if not exists public.portal_claims (
  invoice_id text primary key,
  method text not null,
  claimed_at bigint not null
);
create table if not exists public.portal_reviews (
  id text primary key,
  invoice_id text not null,
  rating int not null,
  text text not null,
  is_private boolean not null default false,
  created_at bigint not null
);
alter table public.portal_invoices enable row level security;
alter table public.portal_claims enable row level security;
alter table public.portal_reviews enable row level security;
create policy "Public portal invoices access" on public.portal_invoices for all using (true) with check (true);
create policy "Public portal claims access" on public.portal_claims for all using (true) with check (true);
create policy "Public portal reviews access" on public.portal_reviews for all using (true) with check (true);`;
