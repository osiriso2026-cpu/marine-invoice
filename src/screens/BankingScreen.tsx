import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useStore } from '../store';
import { money } from '../calc';
import { BrandLogo } from '../logo';
import {
  accountSummaries,
  availableBankAccounts,
  availableBankYears,
  buildAccountingCsv,
  monthLabel,
  monthlySummaries,
  parseBankCsv,
  suggestMatches,
} from '../bank';
import { makeStyles, tokens, useColors } from '../theme';
import { Button, EmptyState } from '../ui';
import type { BankTx } from '../types';

const RECENT_LIMIT = 30;

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1].slice(2)}` : iso;
}

export default function BankingScreen(): JSX.Element {
  const store = useStore();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showAllTx, setShowAllTx] = useState(false);
  const [exportYear, setExportYear] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [linkingTxId, setLinkingTxId] = useState<string | null>(null);

  const { bankTxs } = store;
  const openInvoices = useMemo(
    () => store.data.invoices.filter((i) => i.status !== 'paid'),
    [store.data.invoices],
  );
  const invoiceByNumber = useMemo(() => {
    const m = new Map<string, string>();
    for (const inv of store.data.invoices) m.set(inv.id, inv.number);
    return m;
  }, [store.data.invoices]);

  const accounts = useMemo(() => availableBankAccounts(bankTxs), [bankTxs]);
  const acctSummaries = useMemo(() => accountSummaries(bankTxs), [bankTxs]);
  const activeAccount = accountFilter !== 'all' && accounts.includes(accountFilter) ? accountFilter : undefined;
  const filteredTxs = useMemo(
    () => (activeAccount ? bankTxs.filter((t) => t.account.trim() === activeAccount) : bankTxs),
    [bankTxs, activeAccount],
  );

  const suggestions = useMemo(
    () => suggestMatches(filteredTxs, store.data.invoices, store.data.lines),
    [filteredTxs, store.data.invoices, store.data.lines],
  );
  const months = useMemo(() => monthlySummaries(filteredTxs), [filteredTxs]);
  const years = useMemo(() => availableBankYears(filteredTxs), [filteredTxs]);
  const activeYear = exportYear !== 'all' && years.includes(exportYear) ? exportYear : undefined;
  const txsShown = showAllTx ? filteredTxs : filteredTxs.slice(0, RECENT_LIMIT);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  const handleCsv = async (text: string) => {
    setImportError(null);
    const parsed = parseBankCsv(text);
    if (parsed.error) {
      setImportError(parsed.error);
      return;
    }
    const result = await store.importBankTxs(parsed.txs);
    setPasteOpen(false);
    setPasteText('');
    showToast(
      result.added > 0
        ? `Imported ${result.added} new transaction${result.added === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} already imported)` : ''}.`
        : 'No new transactions — everything in that file was already imported.',
    );
  };

  // Web: native file picker. Phones: paste the CSV text instead.
  const pickFile = () => {
    const doc = (globalThis as { document?: any }).document;
    if (Platform.OS !== 'web' || !doc) {
      setPasteOpen(true);
      return;
    }
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new (globalThis as any).FileReader();
      reader.onload = () => void handleCsv(String(reader.result ?? ''));
      reader.readAsText(file);
    };
    input.click();
  };

  const acceptMatch = async (txId: string, invoiceId: string, invoiceNumber: string) => {
    await store.linkBankTx(txId, invoiceId);
    showToast(`${invoiceNumber} marked paid and linked to the deposit.`);
  };

  const unlink = async (tx: BankTx) => {
    await store.linkBankTx(tx.id, null);
    showToast('Deposit unlinked. The invoice status was not changed.');
  };

  const exportAccounting = async () => {
    const csv = buildAccountingCsv(filteredTxs, store.data.invoices, activeYear, activeAccount);
    const label = [activeAccount ? activeAccount.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '', activeYear ?? 'all-years']
      .filter(Boolean)
      .join('-');
    const filename = `mobile-marine-doc-relay-${label}.csv`;
    const rowCount = activeYear
      ? filteredTxs.filter((t) => t.date.startsWith(`${activeYear}-`)).length
      : filteredTxs.length;

    const g = globalThis as {
      document?: { createElement(tag: string): any; body: { appendChild(n: unknown): void } };
      Blob?: new (parts: string[], opts: { type: string }) => unknown;
      URL?: { createObjectURL(b: unknown): string; revokeObjectURL(u: string): void };
    };

    if (Platform.OS === 'web' && g.document && g.Blob && g.URL) {
      const blob = new g.Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = g.URL.createObjectURL(blob);
      const a = g.document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      g.document.body.appendChild(a);
      a.click();
      a.remove();
      const urlApi = g.URL;
      setTimeout(() => urlApi.revokeObjectURL(url), 60000);
      showToast(`Downloaded ${filename} (${rowCount} transaction${rowCount === 1 ? '' : 's'}).`);
      return;
    }

    try {
      await Clipboard.setStringAsync(csv);
      showToast(`Copied ${rowCount}-row accountant CSV to clipboard.`);
    } catch {
      showToast("Couldn't export CSV on this device.");
    }
  };

  const sectionTitle = {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: c.ink,
    lineHeight: tokens.lineHeight.lg,
  } as const;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View
        style={{
          paddingHorizontal: tokens.space[4],
          paddingTop: tokens.space[3],
          paddingBottom: tokens.space[2],
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space[3],
        }}
      >
        <BrandLogo size={42} />
        <View style={{ flex: 1 }}>
          <Text style={s.title} accessibilityRole="header">
            Banking
          </Text>
          <Text style={s.muted}>Relay transactions, matched to your invoices.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: tokens.space[4], paddingBottom: tokens.space[7], gap: tokens.space[4] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Import */}
        <View style={s.card}>
          <Text style={sectionTitle} accessibilityRole="header">
            Import from Relay
          </Text>
          <Text style={[s.muted, { marginTop: tokens.space[1] }]}>
            In Relay: Transactions → Filter if you like → Export → CSV. Then load the file here. Re-importing the same
            file is safe — duplicates are skipped.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2], marginTop: tokens.space[3] }}>
            <Button icon="upload" label="Import CSV file" onPress={pickFile} />
            <Button
              variant="secondary"
              icon="clipboard"
              label={pasteOpen ? 'Hide paste box' : 'Paste CSV text'}
              onPress={() => setPasteOpen((v) => !v)}
            />
          </View>
          {pasteOpen ? (
            <View style={{ marginTop: tokens.space[3], gap: tokens.space[2] }}>
              <TextInput
                accessibilityLabel="Pasted CSV text"
                style={[s.input, { minHeight: 120, paddingTop: tokens.space[3], textAlignVertical: 'top', fontSize: tokens.fontSize.xs }]}
                multiline
                value={pasteText}
                onChangeText={setPasteText}
                placeholder={'Date,Description,Amount\n2026-11-12,"Zelle from Priya N INV-0003",481.61'}
                placeholderTextColor={c.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button icon="download" label="Import pasted text" disabled={!pasteText.trim()} onPress={() => void handleCsv(pasteText)} />
            </View>
          ) : null}
          {importError ? (
            <Text style={[s.errorText, { marginTop: tokens.space[2] }]} accessibilityLiveRegion="polite">
              {importError}
            </Text>
          ) : null}
        </View>

        {/* Relay Accounts Overview */}
        {acctSummaries.length > 0 ? (
          <View style={s.card}>
            <Text style={sectionTitle} accessibilityRole="header">
              Relay accounts
            </Text>
            <Text style={[s.muted, { marginTop: tokens.space[1] }]}>
              Cash flow across your Relay checking & reserve accounts.
            </Text>
            {accounts.length > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2], marginTop: tokens.space[2] }}>
                {['all', ...accounts].map((acc) => {
                  const active = (activeAccount ?? 'all') === acc;
                  return (
                    <Pressable
                      key={acc}
                      accessibilityRole="button"
                      accessibilityLabel={acc === 'all' ? 'All Relay accounts' : `Filter by ${acc}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => setAccountFilter(acc)}
                      style={({ pressed }) => [s.chip, active && s.chipActive, pressed && s.btnPressed]}
                    >
                      <Text style={[s.btnText, { fontSize: tokens.fontSize.sm }, active && s.btnTextOnAccent]}>
                        {acc === 'all' ? 'All accounts' : acc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <View style={{ marginTop: tokens.space[2] }}>
              {acctSummaries.map((ac) => (
                <View
                  key={ac.account}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: tokens.space[2], borderTopWidth: 1, borderTopColor: c.line }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.body, { fontWeight: tokens.fontWeight.medium }]}>{ac.account}</Text>
                    <Text style={[s.muted, { fontSize: tokens.fontSize.xs }]}>
                      {ac.count} tx · In +{money(ac.moneyIn)} · Out -{money(ac.moneyOut)}
                    </Text>
                  </View>
                  <Text style={[s.money, { color: ac.net >= 0 ? c.success : c.danger }]}>
                    {ac.net >= 0 ? '+' : ''}
                    {money(ac.net)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Suggested matches */}
        {suggestions.length > 0 ? (
          <View style={[s.card, { borderColor: c.accent, borderWidth: 2 }]}>
            <Text style={sectionTitle} accessibilityRole="header">
              Suggested matches
            </Text>
            <Text style={[s.muted, { marginTop: tokens.space[1] }]}>
              Deposits that look like invoice payments. One tap marks the invoice paid.
            </Text>
            {suggestions.map((m) => (
              <View
                key={m.tx.id}
                style={{ marginTop: tokens.space[3], padding: tokens.space[3], borderWidth: 1, borderColor: c.line, borderRadius: tokens.radius.control, gap: tokens.space[2] }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: tokens.space[3] }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.body, { fontWeight: tokens.fontWeight.medium }]} numberOfLines={2}>
                      {m.tx.description}
                    </Text>
                    <Text style={[s.muted, { fontSize: tokens.fontSize.xs }]}>
                      Deposit {shortDate(m.tx.date)}
                      {m.reason === 'number'
                        ? ' · invoice # found in memo'
                        : m.reason === 'client'
                          ? ' · client name + amount match'
                          : ' · amount matches exactly'}
                    </Text>
                  </View>
                  <Text style={[s.money, { color: c.success }]}>+{money(m.tx.amount)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space[2] }}>
                  <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>
                    → {m.invoice.number} · {m.invoice.clientName} · {money(m.total)}
                  </Text>
                  <Button
                    icon="check"
                    label="Mark paid"
                    onPress={() => void acceptMatch(m.tx.id, m.invoice.id, m.invoice.number)}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Monthly statement + Accountant export */}
        {months.length > 0 ? (
          <View style={s.card}>
            <Text style={sectionTitle} accessibilityRole="header">
              Monthly statement
            </Text>
            <View style={{ marginTop: tokens.space[2] }}>
              <View style={{ flexDirection: 'row', paddingVertical: tokens.space[1] }}>
                <Text style={[s.muted, { flex: 1.4, fontSize: tokens.fontSize.xs }]}>MONTH</Text>
                <Text style={[s.muted, { flex: 1, textAlign: 'right', fontSize: tokens.fontSize.xs }]}>IN</Text>
                <Text style={[s.muted, { flex: 1, textAlign: 'right', fontSize: tokens.fontSize.xs }]}>OUT</Text>
                <Text style={[s.muted, { flex: 1, textAlign: 'right', fontSize: tokens.fontSize.xs }]}>NET</Text>
              </View>
              {months.map((mo) => (
                <View
                  key={mo.month}
                  style={{ flexDirection: 'row', paddingVertical: tokens.space[2], borderTopWidth: 1, borderTopColor: c.line, alignItems: 'center' }}
                >
                  <Text style={[s.body, { flex: 1.4, fontWeight: tokens.fontWeight.medium }]}>{monthLabel(mo.month)}</Text>
                  <Text style={[s.money, { flex: 1, textAlign: 'right', fontSize: tokens.fontSize.sm, color: c.success }]}>
                    {money(mo.moneyIn)}
                  </Text>
                  <Text style={[s.money, { flex: 1, textAlign: 'right', fontSize: tokens.fontSize.sm, color: c.danger }]}>
                    {money(mo.moneyOut)}
                  </Text>
                  <Text style={[s.money, { flex: 1, textAlign: 'right', fontSize: tokens.fontSize.sm }]}>{money(mo.net)}</Text>
                </View>
              ))}
            </View>

            <View style={{ marginTop: tokens.space[3], paddingTop: tokens.space[3], borderTopWidth: 1, borderTopColor: c.line, gap: tokens.space[2] }}>
              {years.length > 1 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] }}>
                  {['all', ...years].map((yr) => {
                    const active = (activeYear ?? 'all') === yr;
                    return (
                      <Pressable
                        key={yr}
                        accessibilityRole="button"
                        accessibilityLabel={yr === 'all' ? 'All years' : `Year ${yr}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => setExportYear(yr)}
                        style={({ pressed }) => [s.chip, active && s.chipActive, pressed && s.btnPressed]}
                      >
                        <Text style={[s.btnText, { fontSize: tokens.fontSize.sm }, active && s.btnTextOnAccent]}>
                          {yr === 'all' ? 'All years' : yr}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <Button
                variant="secondary"
                icon="download"
                label={activeYear ? `Export ${activeYear} Schedule C CSV` : 'Export accountant CSV'}
                onPress={() => void exportAccounting()}
              />
              <Text style={[s.muted, { fontSize: tokens.fontSize.xs }]}>
                Includes date, income/expense columns, matched invoice # and client for Schedule C or your bookkeeper.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Transactions */}
        {bankTxs.length === 0 ? (
          <EmptyState
            icon="credit-card"
            title="No transactions yet"
            text="Export your transactions from Relay as a CSV and import them above. Deposits will be matched to your invoices automatically."
          />
        ) : (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={sectionTitle} accessibilityRole="header">
                Transactions
              </Text>
              <Text style={s.muted}>{filteredTxs.length} total</Text>
            </View>
            {txsShown.map((t) => {
              const matchedNumber = t.matchedInvoiceId ? invoiceByNumber.get(t.matchedInvoiceId) : undefined;
              const isPicking = linkingTxId === t.id;
              return (
                <View
                  key={t.id}
                  style={{ paddingVertical: tokens.space[2], borderTopWidth: 1, borderTopColor: c.line }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.body} numberOfLines={1}>
                        {t.description || '(no description)'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: tokens.space[2] }}>
                        <Text style={[s.muted, { fontSize: tokens.fontSize.xs }]}>
                          {[shortDate(t.date), t.account, t.txType, t.category].filter(Boolean).join(' · ')}
                        </Text>
                        {matchedNumber ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Unlink ${matchedNumber} from this deposit`}
                            onPress={() => void unlink(t)}
                            hitSlop={{ top: 6, bottom: 6 }}
                            style={{ backgroundColor: c.accentSoft, borderRadius: tokens.radius.chip, paddingHorizontal: tokens.space[2], paddingVertical: 2 }}
                          >
                            <Text style={{ color: c.accent, fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.medium }}>
                              {matchedNumber} ✕
                            </Text>
                          </Pressable>
                        ) : t.amount > 0 && openInvoices.length > 0 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Link deposit to an invoice"
                            onPress={() => setLinkingTxId(isPicking ? null : t.id)}
                            hitSlop={{ top: 6, bottom: 6 }}
                            style={{ borderWidth: 1, borderColor: c.line, borderRadius: tokens.radius.chip, paddingHorizontal: tokens.space[2], paddingVertical: 2 }}
                          >
                            <Text style={{ color: c.inkMuted, fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.medium }}>
                              {isPicking ? 'Cancel' : '+ Link invoice'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    <Text style={[s.money, { color: t.amount >= 0 ? c.success : c.ink }]}>
                      {t.amount >= 0 ? '+' : ''}
                      {money(t.amount)}
                    </Text>
                  </View>
                  {isPicking ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2], marginTop: tokens.space[2] }}>
                      {openInvoices.map((inv) => (
                        <Pressable
                          key={inv.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Link to ${inv.number} ${inv.clientName}`}
                          onPress={() => {
                            setLinkingTxId(null);
                            void acceptMatch(t.id, inv.id, inv.number);
                          }}
                          style={({ pressed }) => [
                            {
                              backgroundColor: c.accentSoft,
                              borderRadius: tokens.radius.control,
                              paddingHorizontal: tokens.space[3],
                              paddingVertical: tokens.space[2],
                            },
                            pressed && s.btnPressed,
                          ]}
                        >
                          <Text style={{ color: c.accent, fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.bold }}>
                            {inv.number}{inv.clientName ? ` · ${inv.clientName}` : ''}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {filteredTxs.length > RECENT_LIMIT ? (
              <View style={{ marginTop: tokens.space[2] }}>
                <Button
                  variant="tertiary"
                  label={showAllTx ? 'Show recent only' : `Show all ${filteredTxs.length}`}
                  onPress={() => setShowAllTx((v) => !v)}
                />
              </View>
            ) : null}
          </View>
        )}

        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space[3] }}>
            <Feather name="info" size={20} color={c.accent} />
            <Text style={[s.muted, { flex: 1, lineHeight: tokens.lineHeight.sm }]}>
              Relay doesn’t offer a public API yet, so imports are manual for now. Everything stays on this device. When
              Relay opens an API (or we add a bank-sync service), this tab is where the live connection will plug in.
            </Text>
          </View>
        </View>
      </ScrollView>

      {toast ? (
        <View style={[s.toast, { bottom: tokens.space[6] }]} accessibilityLiveRegion="polite" pointerEvents="none">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
