import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useStore } from '../store';
import { money } from '../calc';
import { monthLabel, monthlySummaries, parseBankCsv, suggestMatches } from '../bank';
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

  const { bankTxs } = store;
  const invoiceByNumber = useMemo(() => {
    const m = new Map<string, string>();
    for (const inv of store.data.invoices) m.set(inv.id, inv.number);
    return m;
  }, [store.data.invoices]);

  const suggestions = useMemo(
    () => suggestMatches(bankTxs, store.data.invoices, store.data.lines),
    [bankTxs, store.data.invoices, store.data.lines],
  );
  const months = useMemo(() => monthlySummaries(bankTxs), [bankTxs]);
  const txsShown = showAllTx ? bankTxs : bankTxs.slice(0, RECENT_LIMIT);

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

  const sectionTitle = {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: c.ink,
    lineHeight: tokens.lineHeight.lg,
  } as const;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={{ paddingHorizontal: tokens.space[4], paddingTop: tokens.space[3], paddingBottom: tokens.space[2] }}>
        <Text style={s.title} accessibilityRole="header">
          Banking
        </Text>
        <Text style={s.muted}>Relay transactions, matched to your invoices.</Text>
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
                      {m.reason === 'number' ? ' · invoice # found in memo' : ' · amount matches exactly'}
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

        {/* Monthly statement */}
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
              <Text style={s.muted}>{bankTxs.length} total</Text>
            </View>
            {txsShown.map((t) => {
              const matchedNumber = t.matchedInvoiceId ? invoiceByNumber.get(t.matchedInvoiceId) : undefined;
              return (
                <View
                  key={t.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], paddingVertical: tokens.space[2], borderTopWidth: 1, borderTopColor: c.line }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.body} numberOfLines={1}>
                      {t.description || '(no description)'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
                      <Text style={[s.muted, { fontSize: tokens.fontSize.xs }]}>
                        {shortDate(t.date)}
                        {t.account ? ` · ${t.account}` : ''}
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
                      ) : null}
                    </View>
                  </View>
                  <Text style={[s.money, { color: t.amount >= 0 ? c.success : c.ink }]}>
                    {t.amount >= 0 ? '+' : ''}
                    {money(t.amount)}
                  </Text>
                </View>
              );
            })}
            {bankTxs.length > RECENT_LIMIT ? (
              <View style={{ marginTop: tokens.space[2] }}>
                <Button
                  variant="tertiary"
                  label={showAllTx ? 'Show recent only' : `Show all ${bankTxs.length}`}
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
