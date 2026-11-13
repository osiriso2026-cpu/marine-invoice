import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { computeTotals, lineTotal, money } from '../calc';
import { shareInvoicePdf } from '../pdf';
import CatalogPicker from './CatalogPicker';
import { makeStyles, tokens, useColors } from '../theme';
import type { CatalogItem, EditorProps, Invoice, InvoiceStatus, LineItem, LineType } from '../types';

const SHARE_LABEL = 'Share PDF';
const STATUSES: { key: InvoiceStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'paid', label: 'Paid' },
];
const PAYMENT_METHODS = ['Cash', 'Check', 'Card', 'Bank transfer'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function validDate(v: string): boolean {
  return DATE_RE.test(v) && !isNaN(Date.parse(v));
}
function parseNum(text: string): { ok: boolean; n: number; msg: string } {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: false, n: 0, msg: 'Enter a number' };
  const n = Number(t);
  if (!isFinite(n) || isNaN(n)) return { ok: false, n: 0, msg: 'Numbers only, e.g. 3.5' };
  if (n < 0) return { ok: false, n: 0, msg: 'Can’t be negative' };
  return { ok: true, n, msg: '' };
}
function lightHaptic() {
  try {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* haptics unavailable */
  }
}

function getPortalUrl(portalBaseUrl: string, invoiceId: string): string | null {
  const configured = portalBaseUrl.trim().replace(/\/+$/, '');
  if (configured) return `${configured}/pay/${invoiceId}`;
  if (Platform.OS === 'web') {
    const loc = (globalThis as { location?: { origin?: string } }).location;
    if (loc?.origin) return `${loc.origin.replace(/\/+$/, '')}/pay/${invoiceId}`;
  }
  return null;
}

function phoneFromContact(contact: string): string {
  const trimmed = contact.trim();
  if (!trimmed || trimmed.includes('@')) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function buildSmsUrl(phone: string, body: string): string {
  const encoded = encodeURIComponent(body);
  if (Platform.OS === 'ios') return phone ? `sms:${phone}&body=${encoded}` : `sms:&body=${encoded}`;
  if (Platform.OS === 'android') return phone ? `sms:${phone}?body=${encoded}` : `sms:?body=${encoded}`;
  return phone ? `sms:${phone}?&body=${encoded}` : `sms:?&body=${encoded}`;
}

function buildPaymentSmsText(businessName: string, inv: Invoice, total: number, url: string): string {
  const who = inv.clientName.trim();
  const biz = businessName.trim() || 'Mobile Marine Doc';
  const greet = who ? `Hi ${who}, ` : 'Hi, ';
  return `${greet}here is your ${biz} invoice ${inv.number} ($${money(total)}). View & pay with $0 fee: ${url}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/* ---------- small local building blocks (themed from tokens) ---------- */

function TickMoney({ value, style }: { value: number; style: object }) {
  const anim = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  const reduce = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduce.current = r; }).catch(() => undefined);
    const id = anim.addListener(({ value: v }) => setShown(v));
    return () => anim.removeListener(id);
  }, [anim]);
  useEffect(() => {
    if (reduce.current) {
      anim.setValue(value);
    } else {
      Animated.timing(anim, { toValue: value, duration: tokens.motion.base, useNativeDriver: false }).start();
    }
  }, [value, anim]);
  return <Text style={style}>{money(shown)}</Text>;
}

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
  hint?: string;
  multiline?: boolean;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numbers-and-punctuation';
  onFocus?: () => void;
  onBlur?: () => void;
  style?: object;
}

function TextField(p: TextFieldProps) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={p.style}>
      <Text style={s.label}>{p.label}</Text>
      <TextInput
        accessibilityLabel={p.label}
        style={[s.input, p.multiline && { minHeight: tokens.hit * 2, textAlignVertical: 'top', paddingVertical: tokens.space[2] }, !!p.error && s.inputError]}
        value={p.value}
        onChangeText={p.onChangeText}
        placeholder={p.placeholder}
        placeholderTextColor={c.inkMuted}
        multiline={p.multiline}
        autoCapitalize={p.autoCapitalize ?? 'sentences'}
        keyboardType={p.keyboardType ?? 'default'}
        onFocus={p.onFocus}
        onBlur={p.onBlur}
      />
      {p.error ? <Text style={s.errorText} accessibilityLiveRegion="polite">{p.error}</Text> : p.hint ? <Text style={[s.muted, { fontSize: tokens.fontSize.xs, marginTop: tokens.space[1] }]}>{p.hint}</Text> : null}
    </View>
  );
}

interface NumFieldProps {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  suffix?: string;
  style?: object;
}

function NumField({ label, value, onCommit, suffix, style }: NumFieldProps) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [text, setText] = useState(String(value));
  const [error, setError] = useState('');
  useEffect(() => {
    const r = parseNum(text);
    if (!r.ok || r.n !== value) {
      if (r.ok || text === '') {
        // external change (or cleared field that matches): resync only if the parsed value differs
        if (!(text === '' && error)) setText(String(value));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const change = (t: string) => {
    setText(t);
    const r = parseNum(t);
    if (!r.ok) {
      setError(r.msg);
      return;
    }
    setError('');
    if (r.n !== value) onCommit(r.n);
  };
  return (
    <View style={style}>
      <Text style={s.label}>{label}</Text>
      <View>
        <TextInput
          accessibilityLabel={label}
          style={[s.input, { fontVariant: ['tabular-nums'], paddingRight: suffix ? tokens.space[6] : tokens.space[3] }, !!error && s.inputError]}
          value={text}
          onChangeText={change}
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholderTextColor={c.inkMuted}
        />
        {suffix ? (
          <Text style={[s.muted, { position: 'absolute', right: tokens.space[3], top: tokens.space[3] }]}>{suffix}</Text>
        ) : null}
      </View>
      {error ? <Text style={s.errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [s.chip, active && s.chipActive, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <Text style={[s.btnText, { fontSize: tokens.fontSize.sm }, active && s.btnTextOnAccent]}>{label}</Text>
    </Pressable>
  );
}

function Btn({ label, icon, onPress, variant, disabled, busy }: {
  label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void; variant: 'primary' | 'secondary' | 'tertiary' | 'danger'; disabled?: boolean; busy?: boolean;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const vs = variant === 'primary' ? s.btnPrimary : variant === 'secondary' ? s.btnSecondary : variant === 'danger' ? s.btnDanger : s.btnTertiary;
  const onAccent = variant === 'primary' || variant === 'danger';
  const fg = onAccent ? (variant === 'danger' ? '#FFFFFF' : c.accentInk) : variant === 'tertiary' ? c.accent : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [s.btn, vs, pressed && s.btnPressed, (disabled || busy) && s.btnDisabled]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Feather name={icon} size={20} color={fg} style={{ marginRight: tokens.space[2] }} /> : null}
      {!busy && <Text style={[s.btnText, { color: fg }]} numberOfLines={1}>{label}</Text>}
    </Pressable>
  );
}

function IconBtn({ icon, label, onPress, color }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; color: string }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.iconBtn, pressed && s.btnPressed]}
    >
      <Feather name={icon} size={22} color={color} />
    </Pressable>
  );
}

/* ---------- line row ---------- */

interface LineRowProps {
  line: LineItem;
  onChange: (patch: Partial<LineItem>) => void;
  onDelete: () => void;
}

function LineRow({ line, onChange, onDelete }: LineRowProps) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const labor = line.type === 'labor';
  return (
    <View style={{ paddingVertical: tokens.space[3], borderBottomWidth: 1, borderBottomColor: c.line }}>
      <TextInput
        accessibilityLabel={labor ? 'Labor description' : 'Part description'}
        style={[s.input, { fontWeight: tokens.fontWeight.medium }]}
        value={line.description}
        onChangeText={(t) => onChange({ description: t })}
        placeholder={labor ? 'Labor, e.g. Hull repair & layup' : 'Part description'}
        placeholderTextColor={c.inkMuted}
        multiline
      />
      <View style={{ flexDirection: 'row', gap: tokens.space[2], marginTop: tokens.space[2], flexWrap: 'wrap' }}>
        <NumField style={{ flex: 1, minWidth: 80 }} label={labor ? 'Hours' : 'Qty'} value={line.qty} onCommit={(n) => onChange({ qty: n })} />
        {!labor && (
          <View style={{ width: 80 }}>
            <Text style={s.label}>Unit</Text>
            <TextInput
              accessibilityLabel="Unit"
              style={s.input}
              value={line.unit}
              onChangeText={(t) => onChange({ unit: t })}
              autoCapitalize="none"
              placeholderTextColor={c.inkMuted}
            />
          </View>
        )}
        <NumField style={{ flex: 1, minWidth: 96 }} label={labor ? 'Rate per hour' : 'Unit price'} value={line.unitPrice} onCommit={(n) => onChange({ unitPrice: n })} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: tokens.space[2], justifyContent: 'space-between' }}>
        {labor ? (
          <View style={{ flex: 1 }} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Switch
              accessibilityLabel="Taxable"
              value={line.taxable}
              onValueChange={(v) => onChange({ taxable: v })}
              trackColor={{ true: c.accent, false: c.line }}
            />
            <Text style={[s.muted, { marginLeft: tokens.space[2] }]}>{line.taxable ? 'Taxable' : 'Non-taxable'}</Text>
          </View>
        )}
        <Text style={[s.money, { fontSize: tokens.fontSize.md, marginRight: tokens.space[2] }]}>{money(lineTotal(line))}</Text>
        <IconBtn icon="trash-2" label="Delete line" onPress={onDelete} color={c.danger} />
      </View>
    </View>
  );
}

/* ---------- screen ---------- */

export default function InvoiceEditorScreen({ route, navigation }: EditorProps): JSX.Element {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const store = useStore();
  const { invoiceId } = route.params;

  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [missing, setMissing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nameFocus, setNameFocus] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [shareError, setShareError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const initialized = useRef(false);
  const dirty = useRef(false);
  const deleted = useRef(false);
  const latest = useRef<{ inv: Invoice | null; lines: LineItem[] }>({ inv: null, lines: [] });
  const storeRef = useRef(store);
  storeRef.current = store;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try { navigation.setOptions({ headerShown: false }); } catch { /* no header control */ }
  }, [navigation]);

  // load once the store is ready
  useEffect(() => {
    if (!store.ready || initialized.current) return;
    const found = store.data.invoices.find((i) => i.id === invoiceId);
    if (!found) { setMissing(true); return; }
    initialized.current = true;
    const ls = store.data.lines.filter((l) => l.invoiceId === invoiceId).sort((a, b) => a.sortOrder - b.sortOrder);
    setInv(found);
    setLines(ls);
    latest.current = { inv: found, lines: ls };
  }, [store.ready, store.data.invoices, store.data.lines, invoiceId]);

  const flush = useCallback(async () => {
    const cur = latest.current;
    if (!cur.inv || deleted.current || !dirty.current) return;
    dirty.current = false;
    try {
      await storeRef.current.saveInvoice({ ...cur.inv, updatedAt: Date.now() }, cur.lines);
      setSaveState('saved');
    } catch {
      dirty.current = true;
      setSaveState('saving');
    }
  }, []);

  // debounced autosave
  useEffect(() => {
    if (!inv || !dirty.current) return;
    latest.current = { inv, lines };
    setSaveState('saving');
    const t = setTimeout(() => { void flush(); }, 500);
    return () => clearTimeout(t);
  }, [inv, lines, flush]);

  // save on leaving
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    void flush();
  }, [flush]);

  const showToast = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const setField = <K extends keyof Invoice>(k: K, v: Invoice[K]) => {
    dirty.current = true;
    setInv((prev) => (prev ? { ...prev, [k]: v } : prev));
  };
  const updateLines = (fn: (prev: LineItem[]) => LineItem[]) => {
    dirty.current = true;
    setLines(fn);
  };

  const addLine = (type: LineType, item?: CatalogItem) => {
    if (!inv) return;
    const settings = store.data.settings;
    updateLines((prev) => {
      const next: LineItem = type === 'labor'
        ? { id: uid('ln'), invoiceId: inv.id, type, description: 'Labor', qty: 1, unit: 'hr', unitPrice: settings.defaultHourlyRate, taxable: false, sortOrder: prev.length ? Math.max(...prev.map((l) => l.sortOrder)) + 1 : 0 }
        : item
          ? { id: uid('ln'), invoiceId: inv.id, type, description: item.name, catalogItemId: item.id, qty: 1, unit: item.unit, unitPrice: item.defaultPrice, taxable: item.taxable, sortOrder: prev.length ? Math.max(...prev.map((l) => l.sortOrder)) + 1 : 0 }
          : { id: uid('ln'), invoiceId: inv.id, type, description: '', qty: 1, unit: 'ea', unitPrice: 0, taxable: true, sortOrder: prev.length ? Math.max(...prev.map((l) => l.sortOrder)) + 1 : 0 };
      return [...prev, next];
    });
    setStatusError('');
    lightHaptic();
  };

  const patchLine = (id: string, patch: Partial<LineItem>) =>
    updateLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLine = (line: LineItem) => {
    const index = lines.findIndex((l) => l.id === line.id);
    updateLines((prev) => prev.filter((l) => l.id !== line.id));
    showToast(line.type === 'labor' ? 'Labor line deleted' : 'Part deleted', () => {
      updateLines((prev) => {
        if (prev.some((l) => l.id === line.id)) return prev;
        const copy = [...prev];
        copy.splice(Math.min(index, copy.length), 0, line);
        return copy;
      });
      setToast(null);
    });
  };

  const setStatus = (st: InvoiceStatus) => {
    if (!inv) return;
    if (st !== 'draft') {
      if (!inv.clientName.trim()) {
        setNameTouched(true);
        setStatusError('Add a client name before marking this invoice ' + st + '.');
        return;
      }
      if (lines.length === 0) {
        setStatusError('Add at least one labor or parts line before marking this invoice ' + st + '.');
        return;
      }
    }
    setStatusError('');
    setField('status', st);
    showToast(`Marked ${st}`);
  };

  const onShare = async () => {
    if (!inv || sharing) return;
    if (!inv.clientName.trim()) {
      setNameTouched(true);
      setShareError('Add a client name before sharing.');
      return;
    }
    setShareError('');
    setSharing(true);
    try {
      await flush();
      const msg = await shareInvoicePdf({ ...inv, updatedAt: Date.now() }, lines, store.data.settings);
      if (msg) showToast(msg);
    } catch (e) {
      setShareError(e instanceof Error && e.message ? e.message : 'Couldn’t create the PDF. Check free storage and try again.');
    } finally {
      setSharing(false);
    }
  };

  const onTextLink = async () => {
    if (!inv) return;
    await flush();
    const url = getPortalUrl(store.data.settings.portalBaseUrl, inv.id);
    if (!url) {
      showToast('Add your Customer portal web URL in Settings → Payments first.');
      return;
    }
    const currentTotals = computeTotals(inv, lines);
    const msg = buildPaymentSmsText(store.data.settings.businessName, inv, currentTotals.total, url);
    const copied = await copyToClipboard(msg);
    const phone = phoneFromContact(inv.contact);
    const smsUrl = buildSmsUrl(phone, msg);

    const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? '';
    const isDesktopWeb = Platform.OS === 'web' && !/iPhone|iPad|iPod|Android|Macintosh/i.test(ua);

    if (isDesktopWeb) {
      showToast(copied ? 'Payment text & link copied! Paste into Messages or email.' : url);
      return;
    }

    try {
      await Linking.openURL(smsUrl);
      if (copied) showToast('Payment text also copied to clipboard.');
    } catch {
      showToast(copied ? 'Payment text & link copied to clipboard.' : url);
    }
  };

  const onDelete = () => {
    if (!inv) return;
    setConfirmingDelete(true);
  };

  const doDelete = async () => {
    if (!inv) return;
    setConfirmingDelete(false);
    deleted.current = true;
    try {
      await store.deleteInvoice(inv.id);
    } catch {
      deleted.current = false;
      showToast('Couldn’t delete. Try again.');
      return;
    }
    navigation.goBack();
  };

  const suggestions = useMemo(() => {
    if (!inv || !nameFocus) return [];
    const q = inv.clientName.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: Invoice[] = [];
    [...store.data.invoices].sort((a, b) => b.updatedAt - a.updatedAt).forEach((i) => {
      const key = i.clientName.trim().toLowerCase();
      if (i.id === inv.id || !key || seen.has(key + '|' + i.hullId)) return;
      if (key.includes(q) && key !== q) {
        seen.add(key + '|' + i.hullId);
        out.push(i);
      }
    });
    return out.slice(0, 4);
  }, [inv, nameFocus, store.data.invoices]);

  const pickSuggestion = (i: Invoice) => {
    dirty.current = true;
    setInv((prev) => prev ? { ...prev, clientName: i.clientName, contact: i.contact, boatType: i.boatType, makeModel: i.makeModel, hullId: i.hullId } : prev);
    setNameFocus(false);
  };

  /* ----- render states ----- */

  if (missing) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <View style={[s.empty, { flex: 1, justifyContent: 'center' }]}>
          <View style={s.emptyCircle}><Feather name="file-minus" size={32} color={c.accent} /></View>
          <Text style={s.emptyTitle}>Invoice not found</Text>
          <Text style={s.emptyText}>It may have been deleted.</Text>
          <Btn label="Back to invoices" variant="primary" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!inv) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <View style={{ padding: tokens.space[4], gap: tokens.space[3] }}>
          <View style={[s.skeleton, { height: 32, width: '50%' }]} />
          <View style={[s.skeleton, { height: 160 }]} />
          <View style={[s.skeleton, { height: 120 }]} />
        </View>
      </SafeAreaView>
    );
  }

  const totals = computeTotals(inv, lines);
  const laborLines = lines.filter((l) => l.type === 'labor');
  const partLines = lines.filter((l) => l.type === 'material');
  const nameError = nameTouched && !inv.clientName.trim() ? 'Client name is required' : '';
  const issueErr = inv.issueDate && !validDate(inv.issueDate) ? 'Use YYYY-MM-DD' : '';
  const dueFormatErr = inv.dueDate && !validDate(inv.dueDate) ? 'Use YYYY-MM-DD' : '';
  const dueWarn = !issueErr && !dueFormatErr && validDate(inv.issueDate) && validDate(inv.dueDate) && inv.dueDate < inv.issueDate
    ? 'Due date is before the issue date' : '';
  const methods = PAYMENT_METHODS.includes(inv.paymentMethod) || !inv.paymentMethod ? PAYMENT_METHODS : [...PAYMENT_METHODS, inv.paymentMethod];
  const claim = inv.status !== 'paid' ? store.paymentClaims[inv.id] : undefined;
  const custReview = store.reviews.find((r) => r.invoiceId === inv.id);

  const sectionTitle = { fontSize: tokens.fontSize.lg, fontWeight: tokens.fontWeight.bold, color: c.ink, lineHeight: tokens.lineHeight.lg } as const;
  const gap = { marginTop: tokens.space[3] };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* header: back, title, delete */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.space[2], paddingVertical: tokens.space[1] }}>
          <IconBtn icon="chevron-left" label="Back to invoices" onPress={() => { void flush(); navigation.goBack(); }} color={c.ink} />
          <View style={{ flex: 1, paddingHorizontal: tokens.space[2] }}>
            <Text style={[s.body, { fontWeight: tokens.fontWeight.bold, fontSize: tokens.fontSize.lg }]} accessibilityRole="header">{inv.number}</Text>
            <Text style={s.muted}>{saveState === 'saving' ? 'Saving…' : 'Saved on this device'}</Text>
          </View>
          <IconBtn icon="trash-2" label="Delete invoice" onPress={onDelete} color={c.danger} />
        </View>

        {confirmingDelete ? (
          <View style={[s.card, { marginHorizontal: tokens.space[4], marginBottom: tokens.space[2] }]} accessibilityLiveRegion="polite">
            <Text style={[s.body, { fontWeight: tokens.fontWeight.bold }]} accessibilityRole="header">Delete {inv.number}?</Text>
            <Text style={s.muted}>This removes the invoice and all its lines. The number won’t be reused.</Text>
            <View style={{ flexDirection: 'row', gap: tokens.space[3], marginTop: tokens.space[3] }}>
              <View style={{ flex: 1 }}>
                <Btn label="Keep invoice" variant="secondary" onPress={() => setConfirmingDelete(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn label="Delete" variant="danger" onPress={() => { void doDelete(); }} />
              </View>
            </View>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={{ padding: tokens.space[4], paddingBottom: tokens.space[6], gap: tokens.space[4] }}
          keyboardShouldPersistTaps="handled"
        >
          {claim ? (
            <View style={[s.card, { borderColor: c.warning }]} accessibilityLiveRegion="polite">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
                <Feather name="clock" size={20} color={c.warning} />
                <Text style={[s.body, { fontWeight: tokens.fontWeight.bold, flex: 1 }]}>
                  Customer says they sent a {claim.method} payment
                </Text>
              </View>
              <Text style={[s.muted, { marginTop: tokens.space[1] }]}>
                Marked sent {new Date(claim.claimedAt).toLocaleDateString()}. Check your bank, then set the status to Paid below.
              </Text>
            </View>
          ) : null}

          {custReview ? (
            <View style={[s.card, custReview.isPrivate && { borderColor: c.warning }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
                <Feather name={custReview.isPrivate ? 'alert-triangle' : 'star'} size={20} color={custReview.isPrivate ? c.warning : c.accent} />
                <Text style={[s.body, { fontWeight: tokens.fontWeight.bold, flex: 1 }]}>
                  {custReview.isPrivate ? 'Private customer feedback' : 'Customer review'} · {custReview.rating}/5
                </Text>
              </View>
              <Text style={[s.body, { marginTop: tokens.space[2] }]}>{custReview.text}</Text>
              {custReview.isPrivate ? (
                <Text style={[s.muted, { marginTop: tokens.space[1] }]}>
                  Only you can see this. Reach out to the client before it becomes a public review.
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Client & vessel */}
          <View style={s.card}>
            <Text style={sectionTitle} accessibilityRole="header">Client and vessel</Text>
            <View style={gap}>
              <TextField
                label="Client name"
                value={inv.clientName}
                onChangeText={(t) => setField('clientName', t)}
                error={nameError}
                autoCapitalize="words"
                placeholder="e.g. J. Ortiz"
                onFocus={() => setNameFocus(true)}
                onBlur={() => { setNameTouched(true); setTimeout(() => setNameFocus(false), 200); }}
              />
              {suggestions.length > 0 && (
                <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: tokens.radius.control, marginTop: tokens.space[1], overflow: 'hidden' }}>
                  {suggestions.map((sg) => (
                    <Pressable
                      key={sg.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${sg.clientName}${sg.makeModel ? ', ' + sg.makeModel : ''}`}
                      onPress={() => pickSuggestion(sg)}
                      style={({ pressed }) => [{ minHeight: tokens.hit, paddingHorizontal: tokens.space[3], paddingVertical: tokens.space[2], justifyContent: 'center', backgroundColor: pressed ? c.accentSoft : c.surface, borderBottomWidth: 1, borderBottomColor: c.line }]}
                    >
                      <Text style={[s.body, { fontWeight: tokens.fontWeight.medium }]}>{sg.clientName}</Text>
                      <Text style={s.muted}>{[sg.boatType, sg.makeModel, sg.hullId].filter(Boolean).join(' · ') || 'Previous client'}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <TextField style={gap} label="Contact (phone or email)" value={inv.contact} onChangeText={(t) => setField('contact', t)} autoCapitalize="none" />
            <View style={[{ flexDirection: 'row', gap: tokens.space[2] }, gap]}>
              <TextField style={{ flex: 1 }} label="Boat type" value={inv.boatType} onChangeText={(t) => setField('boatType', t)} placeholder="Center console" />
              <TextField style={{ flex: 1 }} label="Make / model" value={inv.makeModel} onChangeText={(t) => setField('makeModel', t)} placeholder="Boston Whaler 210" autoCapitalize="words" />
            </View>
            <View style={[{ flexDirection: 'row', gap: tokens.space[2] }, gap]}>
              <TextField style={{ flex: 1 }} label="Hull ID" value={inv.hullId} onChangeText={(t) => setField('hullId', t.toUpperCase())} autoCapitalize="characters" placeholder="ABC12345D404" />
              <TextField style={{ flex: 1 }} label="Work order no." value={inv.workOrderNo} onChangeText={(t) => setField('workOrderNo', t)} autoCapitalize="characters" placeholder="WO-1042" />
            </View>
            <TextField style={gap} label="Repair description" value={inv.repairDescription} onChangeText={(t) => setField('repairDescription', t)} multiline placeholder="What was repaired and how" />
          </View>

          {/* Dates & payment */}
          <View style={s.card}>
            <Text style={sectionTitle} accessibilityRole="header">Dates and payment</Text>
            <View style={[{ flexDirection: 'row', gap: tokens.space[2] }, gap]}>
              <TextField style={{ flex: 1 }} label="Issue date" value={inv.issueDate} onChangeText={(t) => setField('issueDate', t)} error={issueErr} hint="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
              <TextField style={{ flex: 1 }} label="Due date" value={inv.dueDate} onChangeText={(t) => setField('dueDate', t)} error={dueFormatErr} hint="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            </View>
            {dueWarn ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: tokens.space[2] }} accessibilityLiveRegion="polite">
                <Feather name="alert-triangle" size={16} color={c.warning} />
                <Text style={[s.muted, { color: c.warningInk, marginLeft: tokens.space[2], flex: 1 }]}>{dueWarn}</Text>
              </View>
            ) : null}
            <Text style={[s.label, gap]}>Payment method</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] }}>
              {methods.map((m) => (
                <Pill key={m} label={m} active={inv.paymentMethod === m} onPress={() => setField('paymentMethod', inv.paymentMethod === m ? '' : m)} />
              ))}
            </View>
          </View>

          {/* Labor */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={sectionTitle} accessibilityRole="header">Labor</Text>
              <Text style={[s.money, { fontSize: tokens.fontSize.md }]}>{money(totals.labor)}</Text>
            </View>
            {laborLines.length === 0 ? (
              <Text style={[s.muted, gap]}>No labor yet. Add hours at your hourly rate ({money(store.data.settings.defaultHourlyRate)}).</Text>
            ) : (
              laborLines.map((l) => (
                <LineRow key={l.id} line={l} onChange={(p) => patchLine(l.id, p)} onDelete={() => removeLine(l)} />
              ))
            )}
            <View style={gap}>
              <Btn label="Add labor" icon="plus" variant="secondary" onPress={() => addLine('labor')} />
            </View>
          </View>

          {/* Materials */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={sectionTitle} accessibilityRole="header">Parts and materials</Text>
              <Text style={[s.money, { fontSize: tokens.fontSize.md }]}>{money(totals.parts)}</Text>
            </View>
            {partLines.length === 0 ? (
              <Text style={[s.muted, gap]}>No parts yet. Pick resin, cloth or gelcoat from the catalog, or add a custom part.</Text>
            ) : (
              partLines.map((l) => (
                <LineRow key={l.id} line={l} onChange={(p) => patchLine(l.id, p)} onDelete={() => removeLine(l)} />
              ))
            )}
            <View style={[{ flexDirection: 'row', gap: tokens.space[2], flexWrap: 'wrap' }, gap]}>
              <View style={{ flex: 1, minWidth: 140 }}><Btn label="From catalog" icon="search" variant="secondary" onPress={() => setPickerOpen(true)} /></View>
              <View style={{ flex: 1, minWidth: 140 }}><Btn label="Custom part" icon="plus" variant="secondary" onPress={() => addLine('material')} /></View>
            </View>
          </View>

          {/* Totals */}
          <View style={s.card}>
            <Text style={sectionTitle} accessibilityRole="header">Totals</Text>
            <View style={[{ flexDirection: 'row', gap: tokens.space[2] }, gap]}>
              <NumField style={{ flex: 1 }} label="Parts markup" suffix="%" value={inv.markupPct} onCommit={(n) => setField('markupPct', n)} />
              <NumField style={{ flex: 1 }} label="Tax rate" suffix="%" value={inv.taxRate} onCommit={(n) => setField('taxRate', n)} />
            </View>
            <View style={{ marginTop: tokens.space[3] }}>
              {[
                { k: 'Labor subtotal', v: totals.labor },
                { k: 'Parts subtotal', v: totals.parts },
                { k: `Markup (${inv.markupPct}%)`, v: totals.markup },
                { k: `Tax (${inv.taxRate}% on taxable parts)`, v: totals.tax },
              ].map((r) => (
                <View key={r.k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: tokens.space[1] }}>
                  <Text style={[s.muted, { flex: 1, paddingRight: tokens.space[2] }]}>{r.k}</Text>
                  <Text style={[s.money, { fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.medium }]}>{money(r.v)}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: tokens.space[2], marginTop: tokens.space[2], borderTopWidth: 1, borderTopColor: c.line }}>
                <Text style={[s.body, { fontWeight: tokens.fontWeight.bold }]}>Total</Text>
                <Text style={[s.money, { fontSize: tokens.fontSize.lg }]}>{money(totals.total)}</Text>
              </View>
            </View>
          </View>

          {/* Status & notes */}
          <View style={s.card}>
            <Text style={sectionTitle} accessibilityRole="header">Status and notes</Text>
            <View style={[{ flexDirection: 'row', gap: tokens.space[2], flexWrap: 'wrap' }, gap]}>
              {STATUSES.map((st) => (
                <Pill key={st.key} label={st.label} active={inv.status === st.key} onPress={() => setStatus(st.key)} />
              ))}
            </View>
            {statusError ? <Text style={s.errorText} accessibilityLiveRegion="polite">{statusError}</Text> : null}
            <TextField style={gap} label="Notes" value={inv.notes} onChangeText={(t) => setField('notes', t)} multiline placeholder="Warranty, authorization, payment instructions" />
          </View>
        </ScrollView>

        {/* sticky totals bar */}
        <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: tokens.space[4], paddingVertical: tokens.space[3] }}>
          {shareError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.space[2] }} accessibilityLiveRegion="polite">
              <Text style={[s.errorText, { flex: 1, marginTop: 0 }]}>{shareError}</Text>
              <Btn label="Retry" variant="tertiary" onPress={onShare} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 110 }}>
              <Text style={s.muted}>Total due</Text>
              <TickMoney value={totals.total} style={[s.money, { fontSize: tokens.fontSize.xl, lineHeight: tokens.lineHeight.xl }]} />
            </View>
            <Btn
              label="Text link"
              icon="message-square"
              variant="secondary"
              onPress={() => { void onTextLink(); }}
            />
            <Btn
              label="Customer page"
              icon="credit-card"
              variant="secondary"
              onPress={() => { void flush(); navigation.navigate('CustomerPortal', { invoiceId: inv.id }); }}
            />
            <Btn label={SHARE_LABEL} icon="share" variant="primary" onPress={onShare} busy={sharing} />
          </View>
        </View>

        {toast ? (
          <View style={[s.toast, { flexDirection: 'row', alignItems: 'center', bottom: tokens.space[8] + tokens.space[5] }]} accessibilityLiveRegion="polite">
            <Text style={[s.toastText, { flex: 1 }]}>{toast.msg}</Text>
            {toast.undo ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={toast.undo} style={{ minHeight: tokens.hit, justifyContent: 'center', paddingHorizontal: tokens.space[2] }}>
                <Text style={[s.toastText, { fontWeight: tokens.fontWeight.bold, color: c.accent }]}>Undo</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <CatalogPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(item) => { addLine('material', item); setPickerOpen(false); }}
      />
    </SafeAreaView>
  );
}
