import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { computeTotals, money } from '../calc';
import { BrandLogo } from '../logo';
import { makeStyles, tokens, useColors } from '../theme';
import type { Invoice, InvoiceStatus, LineItem } from '../types';

type Filter = 'all' | InvoiceStatus;
type DisplayStatus = InvoiceStatus | 'overdue';

const STATUS_LABEL: Record<InvoiceStatus, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid' };
const DISPLAY_LABEL: Record<DisplayStatus, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue' };
const STATUS_ICON: Record<DisplayStatus, 'edit-3' | 'send' | 'check-circle' | 'alert-circle'> = {
  draft: 'edit-3',
  sent: 'send',
  paid: 'check-circle',
  overdue: 'alert-circle',
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return iso;
  }
}

function relativeDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  try {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(days, 'day');
  } catch {
    return formatDate(iso);
  }
}

interface Row {
  inv: Invoice;
  total: number;
  vessel: string;
  overdue: boolean;
}

function StorageNotice({ onResult }: { onResult: (msg: string) => void }): JSX.Element {
  const store = useStore();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await store.retryStorage();
      onResult(ok ? 'Storage is working. Invoices are saved on this device.' : 'Storage is still unavailable. Invoices stay in memory for now.');
    } catch {
      onResult('Storage is still unavailable. Invoices stay in memory for now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.card, local.notice]} accessibilityLiveRegion="polite">
      <View style={local.noticeRow}>
        <View style={[local.noticeCircle, { backgroundColor: c.dangerSoft }]}>
          <Feather name="alert-triangle" size={20} color={c.danger} />
        </View>
        <View style={local.flex}>
          <Text style={[s.body, { fontWeight: tokens.fontWeight.bold }]} accessibilityRole="header">
            Storage unavailable
          </Text>
          <Text style={s.muted}>Invoices are kept in memory until storage works. Retry before closing the app.</Text>
        </View>
      </View>
      <View style={local.noticeActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry storage"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={retry}
          style={({ pressed }) => [s.btn, s.btnPrimary, local.flex, pressed && s.btnPressed, pressed && local.pressedScale]}
        >
          {busy ? (
            <ActivityIndicator color={c.accentInk} />
          ) : (
            <Text style={[s.btnText, s.btnTextOnAccent]} numberOfLines={1}>
              Retry
            </Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue offline"
          disabled={busy}
          onPress={() => {
            store.dismissStorageError();
            onResult('Working offline. Invoices are kept in memory for this session.');
          }}
          style={({ pressed }) => [s.btn, local.outlined, { borderColor: c.line }, local.flex, pressed && s.btnPressed, pressed && local.pressedScale]}
        >
          <Text style={s.btnText} numberOfLines={1}>
            Continue offline
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function InvoicesScreen(): JSX.Element {
  const store = useStore();
  const navigation = useNavigation<any>();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const { invoices, lines } = store.data;

  const rows: Row[] = useMemo(() => {
    const today = todayIso();
    const byInvoice = new Map<string, LineItem[]>();
    for (const l of lines) {
      const arr = byInvoice.get(l.invoiceId);
      if (arr) arr.push(l);
      else byInvoice.set(l.invoiceId, [l]);
    }
    return [...invoices]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((inv) => {
        const vessel = [inv.makeModel, inv.boatType, inv.hullId ? `HIN ${inv.hullId}` : '']
          .map((p) => p.trim())
          .filter(Boolean)
          .join(' · ');
        const overdue = inv.status === 'sent' && !!inv.dueDate && inv.dueDate < today;
        return { inv, total: computeTotals(inv, byInvoice.get(inv.id) ?? []).total, vessel, overdue };
      });
  }, [invoices, lines]);

  const counts = useMemo(() => {
    const k = { all: rows.length, draft: 0, sent: 0, paid: 0, overdue: 0 };
    for (const r of rows) {
      k[r.inv.status] += 1;
      if (r.overdue) k.overdue += 1;
    }
    return k;
  }, [rows]);

  const outstanding = useMemo(
    () => rows.filter((r) => r.inv.status === 'sent').reduce((sum, r) => sum + r.total, 0),
    [rows]
  );

  const summaryLine = [
    `${counts.sent} unpaid`,
    `${counts.overdue} overdue`,
    counts.draft > 0 ? `${counts.draft} ${counts.draft === 1 ? 'draft' : 'drafts'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.inv.status !== filter) return false;
      if (!q) return true;
      const i = r.inv;
      const hay = [i.number, i.clientName, i.boatType, i.makeModel, i.hullId, i.workOrderNo, i.repairDescription]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, filter]);

  const onNew = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setCreating(true);
    setError('');
    try {
      const inv = await store.createInvoice();
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } catch {
        // haptics unavailable
      }
      navigation.navigate('InvoiceEditor', { invoiceId: inv.id });
    } catch {
      setError("Couldn't create the invoice. Try again.");
    } finally {
      busy.current = false;
      setCreating(false);
    }
  }, [store, navigation]);

  const statusColor = (st: DisplayStatus): string =>
    st === 'paid' ? c.successInk : st === 'overdue' ? c.danger : st === 'sent' ? c.accent : c.inkMuted;

  const newButton = (label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={creating}
      onPress={onNew}
      style={({ pressed }) => [
        s.btn,
        s.btnPrimary,
        local.primaryBtn,
        pressed && s.btnPressed,
        pressed && local.pressedScale,
        creating && s.btnDisabled,
      ]}
    >
      {creating ? (
        <ActivityIndicator color={c.accentInk} />
      ) : (
        <>
          <Feather name="plus" size={20} color={c.accentInk} />
          <Text style={[s.btnText, s.btnTextOnAccent, local.btnLabel]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );

  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], marginBottom: tokens.space[3] }}>
        <BrandLogo size={46} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={s.title}>
            {store.data.settings.businessName || 'Mobile Marine Doc'}
          </Text>
          <Text style={[s.muted, { fontSize: tokens.fontSize.xs }]}>
            Fiberglass Repair & Marine Services · Invoices
          </Text>
        </View>
      </View>

      {store.ready && store.storageError ? <StorageNotice onResult={showToast} /> : null}

      {error ? (
        <View style={local.errorRow} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={16} color={c.danger} />
          <Text style={[s.errorText, local.errorMsg]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry new invoice"
            onPress={onNew}
            style={({ pressed }) => [s.btn, s.btnTertiary, pressed && s.btnPressed]}
          >
            <Text style={[s.btnText, { color: c.accent }]} numberOfLines={1}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : null}

      {rows.length > 0 ? (
        <View>
          <View style={local.hero}>
            <Text style={s.muted}>Outstanding</Text>
            <Text style={[s.money, local.heroFigure]}>{money(outstanding)}</Text>
            <Text style={s.muted}>{summaryLine}</Text>
          </View>

          {newButton('New invoice')}

          <View style={[local.searchBox, { borderColor: c.line, backgroundColor: c.surface }]}>
            <Feather name="search" size={20} color={c.inkMuted} />
            <TextInput
              accessibilityLabel="Search invoices"
              value={query}
              onChangeText={setQuery}
              placeholder="Search client, boat, hull ID, invoice #"
              placeholderTextColor={c.inkMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={[local.searchInput, { color: c.ink }]}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery('')}
                style={({ pressed }) => [s.iconBtn, pressed && s.btnPressed]}
              >
                <Feather name="x" size={20} color={c.inkMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={local.chips}>
            {(['all', 'draft', 'sent', 'paid'] as Filter[]).map((f) => {
              const active = filter === f;
              const label = f === 'all' ? 'All' : STATUS_LABEL[f];
              return (
                <Pressable
                  key={f}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, ${counts[f]} invoices`}
                  accessibilityState={{ selected: active }}
                  hitSlop={4}
                  onPress={() => setFilter(f)}
                  style={({ pressed }) => [s.chip, active && s.chipActive, pressed && s.btnPressed]}
                >
                  <Text style={[s.btnText, local.chipText, active && s.btnTextOnAccent]} numberOfLines={1}>
                    {label} {counts[f]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: Row }) => {
    const { inv } = item;
    const disp: DisplayStatus = item.overdue ? 'overdue' : inv.status;
    const color = statusColor(disp);
    const name = inv.clientName.trim() || 'No client yet';
    const title = item.vessel ? `${name} · ${inv.makeModel.trim() || inv.boatType.trim() || ''}`.replace(/ · $/, '') : name;
    const when = inv.issueDate ? `Issued ${relativeDate(inv.issueDate)}` : '';
    const second = [inv.workOrderNo.trim(), when].filter(Boolean).join(' · ');
    const label = `${inv.number}, ${name}, ${money(item.total)}, ${DISPLAY_LABEL[disp]}`;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open invoice ${label}`}
        onPress={() => navigation.navigate('InvoiceEditor', { invoiceId: inv.id })}
        style={({ pressed }) => [local.row, { backgroundColor: c.surface, borderColor: c.line }, pressed && s.btnPressed]}
      >
        <View style={local.flex}>
          <Text style={[s.muted, s.money, { fontWeight: tokens.fontWeight.medium, color: c.inkMuted }]}>{inv.number}</Text>
          <Text style={[s.body, { fontWeight: tokens.fontWeight.medium }]}>{title}</Text>
          {inv.hullId ? <Text style={s.muted}>HIN {inv.hullId}</Text> : null}
          {second ? <Text style={s.muted}>{second}</Text> : null}
        </View>
        <View style={local.rowRight}>
          <Text style={[s.money, { fontSize: tokens.fontSize.md }]}>{money(item.total)}</Text>
          <View style={[local.status, { borderColor: color }]}>
            <Feather name={STATUS_ICON[disp]} size={12} color={color} />
            <Text style={[local.statusText, { color }]}>{DISPLAY_LABEL[disp]}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  let empty: JSX.Element | null = null;
  if (!store.ready) {
    empty = (
      <View accessibilityLabel="Loading invoices">
        {[0, 1, 2].map((i) => (
          <View key={i} style={[s.card, local.skelCard]}>
            <View style={[s.skeleton, { height: 16, width: '40%' }]} />
            <View style={[s.skeleton, { height: 16, width: '70%', marginTop: tokens.space[2] }]} />
            <View style={[s.skeleton, { height: 12, width: '55%', marginTop: tokens.space[2] }]} />
          </View>
        ))}
      </View>
    );
  } else if (rows.length === 0) {
    empty = (
      <View style={[s.empty, local.emptyWrap]}>
        <View style={s.emptyCircle}>
          <Feather name="file-text" size={32} color={c.accent} />
        </View>
        <Text style={s.emptyTitle}>No invoices yet</Text>
        <Text style={s.emptyText}>
          Quote a repair with labor hours and catalog materials. Everything stays on this device, even offline.
        </Text>
        {newButton('New invoice')}
      </View>
    );
  } else if (visible.length === 0) {
    empty = (
      <View style={[s.empty, local.emptyWrap]}>
        <View style={s.emptyCircle}>
          <Feather name="search" size={32} color={c.accent} />
        </View>
        <Text style={s.emptyTitle}>No matching invoices</Text>
        <Text style={s.emptyText}>
          {query.trim() ? `Nothing found for "${query.trim()}".` : `No ${filter} invoices.`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search and filters"
          onPress={() => {
            setQuery('');
            setFilter('all');
          }}
          style={({ pressed }) => [s.btn, s.btnSecondary, pressed && s.btnPressed]}
        >
          <Text style={s.btnText} numberOfLines={1}>
            Clear filters
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <FlatList
        data={store.ready ? visible : []}
        keyExtractor={(r) => r.inv.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={local.content}
        ItemSeparatorComponent={Separator}
      />
      {toast ? (
        <View style={s.toast} accessibilityLiveRegion="polite" pointerEvents="none">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Separator(): JSX.Element {
  return <View style={{ height: tokens.space[2] }} />;
}

const local = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: tokens.space[4], paddingBottom: tokens.space[6], paddingTop: tokens.space[2] },
  title: { marginBottom: tokens.space[4] },
  btnLabel: { marginLeft: tokens.space[2] },
  primaryBtn: { minHeight: tokens.hit + tokens.space[1], marginBottom: tokens.space[4] },
  pressedScale: { transform: [{ scale: 0.97 }] },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], marginBottom: tokens.space[3] },
  errorMsg: { flex: 1, marginTop: 0 },
  hero: { marginBottom: tokens.space[4] },
  heroFigure: { fontSize: tokens.fontSize.hero, lineHeight: tokens.lineHeight.hero },
  notice: { marginBottom: tokens.space[4] },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space[3] },
  noticeCircle: { width: tokens.hit, height: tokens.hit, borderRadius: tokens.hit / 2, alignItems: 'center', justifyContent: 'center' },
  noticeActions: { flexDirection: 'row', gap: tokens.space[3], marginTop: tokens.space[4] },
  outlined: { backgroundColor: 'transparent', borderWidth: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.control,
    paddingLeft: tokens.space[3],
    minHeight: tokens.hit,
  },
  searchInput: { flex: 1, minHeight: tokens.hit, paddingHorizontal: tokens.space[2], fontSize: tokens.fontSize.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2], marginTop: tokens.space[3], marginBottom: tokens.space[4] },
  chipText: { fontSize: tokens.fontSize.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: tokens.hit + tokens.space[4],
    padding: tokens.space[4],
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    gap: tokens.space[3],
  },
  rowRight: { alignItems: 'flex-end', gap: tokens.space[2] },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
    paddingHorizontal: tokens.space[2],
    height: 24,
    borderRadius: tokens.radius.chip,
    borderWidth: 1,
  },
  statusText: { fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.medium },
  skelCard: { marginBottom: tokens.space[2] },
  emptyWrap: { paddingTop: tokens.space[7] },
});
