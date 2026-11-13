import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { makeStyles, tokens, useColors } from '../theme';
import type { CatalogItem, Category } from '../types';

const t = tokens;

const CATEGORY_ORDER: Category[] = ['resin', 'reinforcement', 'gelcoat', 'consumable', 'hardware'];

const CATEGORY_META: Record<Category, { label: string; short: string; icon: React.ComponentProps<typeof Feather>['name'] }> = {
  resin: { label: 'Resins', short: 'Resins', icon: 'droplet' },
  reinforcement: { label: 'Reinforcements', short: 'Reinforcement', icon: 'layers' },
  gelcoat: { label: 'Gelcoat & finishing', short: 'Gelcoat', icon: 'edit-3' },
  consumable: { label: 'Consumables', short: 'Consumables', icon: 'package' },
  hardware: { label: 'Hardware', short: 'Hardware', icon: 'tool' },
};

const UNIT_SUGGESTIONS = ['gallon', 'quart', 'yard', 'roll', 'kit', 'each', 'oz', 'lb', 'sheet', 'pack'];

type Filter = 'all' | Category;

const moneyFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => moneyFmt.format(Number.isFinite(n) ? n : 0);

function parsePrice(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function newId(): string {
  return `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function buzz(kind: 'light' | 'success') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // haptics are optional
  }
}

interface ToastState { message: string; undo?: () => void; key: number }

export default function CatalogScreen(): JSX.Element {
  const store = useStore();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const l = useMemo(() => makeLocal(c), [c]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ item: CatalogItem; isNew: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const catalog = store.data.catalog;

  const showToast = (message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const sections = useMemo(() => {
    const tokens2 = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (it: CatalogItem) => {
      if (filter !== 'all' && it.category !== filter) return false;
      if (tokens2.length === 0) return true;
      const hay = `${it.name} ${it.unit} ${it.note} ${CATEGORY_META[it.category].label}`.toLowerCase();
      return tokens2.every((tk) => hay.includes(tk));
    };
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      data: catalog.filter((it) => it.category === cat && matches(it)).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((sec) => sec.data.length > 0);
  }, [catalog, query, filter]);

  const openNew = () => {
    setEditing({
      item: {
        id: newId(),
        category: filter === 'all' ? 'consumable' : filter,
        name: '',
        unit: 'each',
        defaultPrice: 0,
        taxable: true,
        note: '',
        isCustom: true,
      },
      isNew: true,
    });
  };

  const saveItem = async (item: CatalogItem) => {
    try {
      await store.saveCatalogItem(item);
      buzz('success');
      setEditing(null);
      showToast(`Saved ${item.name}. Existing invoices keep their prices.`);
    } catch {
      showToast("Couldn't save the item. Try again.");
    }
  };

  const removeItem = async (item: CatalogItem) => {
    try {
      await store.deleteCatalogItem(item.id);
      setEditing(null);
      showToast(`Deleted ${item.name}`, () => {
        void store.saveCatalogItem(item);
      });
    } catch {
      showToast("Couldn't delete the item. Try again.");
    }
  };

  const doReset = async () => {
    try {
      await store.resetCatalog();
      setMenuOpen(false);
      showToast('Catalog restored to default items and prices');
    } catch {
      showToast("Couldn't reset the catalog. Try again.");
    }
  };

  const doClearSamples = async () => {
    const removed = catalog.filter((it) => !it.isCustom);
    try {
      for (const it of removed) await store.deleteCatalogItem(it.id);
      setMenuOpen(false);
      showToast(`Removed ${removed.length} sample items`, () => {
        removed.forEach((it) => { void store.saveCatalogItem(it); });
      });
    } catch {
      showToast("Couldn't clear sample items. Try again.");
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    ...CATEGORY_ORDER.map((cat) => ({ key: cat as Filter, label: CATEGORY_META[cat].short })),
  ];

  const renderEmpty = () => {
    if (!store.ready) {
      return (
        <View style={l.skeletonWrap}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={[s.skeleton, l.skeletonRow]} />
          ))}
        </View>
      );
    }
    if (catalog.length === 0) {
      return (
        <View style={s.empty}>
          <View style={s.emptyCircle}><Feather name="package" size={32} color={c.accent} /></View>
          <Text style={s.emptyTitle} accessibilityRole="header">Catalog is empty</Text>
          <Text style={s.emptyText}>Restore the marine starter list of resins, cloth, gelcoat and consumables, or add your own part.</Text>
          <View style={l.emptyActions}>
            <Btn c={c} s={s} label="Restore defaults" variant="primary" onPress={doReset} />
            <Btn c={c} s={s} label="Add item" variant="secondary" onPress={openNew} />
          </View>
        </View>
      );
    }
    return (
      <View style={s.empty}>
        <View style={s.emptyCircle}><Feather name="search" size={32} color={c.accent} /></View>
        <Text style={s.emptyTitle} accessibilityRole="header">No matches</Text>
        <Text style={s.emptyText}>Nothing in the catalog fits that search. Check the spelling or add it as a custom item.</Text>
        <View style={l.emptyActions}>
          <Btn c={c} s={s} label="Clear search" variant="secondary" onPress={() => { setQuery(''); setFilter('all'); }} />
          <Btn c={c} s={s} label="Add item" variant="primary" onPress={openNew} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={l.header}>
        <Text style={s.title} accessibilityRole="header">Catalog</Text>
        <View style={l.headerActions}>
          <IconBtn c={c} s={s} icon="plus" label="Add custom item" onPress={openNew} filled />
          <IconBtn c={c} s={s} icon="more-horizontal" label="More catalog options" onPress={() => setMenuOpen(true)} />
        </View>
      </View>

      <View style={l.searchWrap}>
        <View style={[s.input, l.searchBox]}>
          <Feather name="search" size={20} color={c.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search resin, biaxial, gelcoat"
            placeholderTextColor={c.inkMuted}
            style={l.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search catalog"
          />
          {query.length > 0 && Platform.OS !== 'ios' ? (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={t.space[2]}
              style={l.clearBtn}
            >
              <Feather name="x" size={20} color={c.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={l.chipRow}
          accessibilityRole="tablist"
        >
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show ${f.label}`}
                style={({ pressed }) => [s.chip, l.chip, active && s.chipActive, pressed && s.btnPressed]}
              >
                <Text style={[s.btnText, { fontSize: t.fontSize.sm }, active && s.btnTextOnAccent]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(it) => it.id}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={l.listContent}
        ListEmptyComponent={renderEmpty}
        renderSectionHeader={({ section }) => (
          <View style={l.sectionHeader}>
            <Feather name={CATEGORY_META[section.category].icon} size={20} color={c.accent} />
            <Text style={l.sectionTitle} accessibilityRole="header">{CATEGORY_META[section.category].label}</Text>
            <Text style={s.muted}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setEditing({ item, isNew: false })}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${fmt(item.defaultPrice)} per ${item.unit}. Open details`}
            style={({ pressed }) => [s.listRow, pressed && l.rowPressed]}
          >
            <View style={l.rowMain}>
              <Text style={s.body}>{item.name}</Text>
              <View style={l.rowMeta}>
                <Text style={s.muted}>per {item.unit}</Text>
                {item.isCustom ? <Text style={l.badge}>Custom</Text> : null}
                {!item.taxable ? <Text style={l.badgeMuted}>Non-taxable</Text> : null}
              </View>
            </View>
            <Text style={[s.money, l.price]}>{fmt(item.defaultPrice)}</Text>
            <Feather name="chevron-right" size={20} color={c.inkMuted} />
          </Pressable>
        )}
      />

      {toast ? (
        <View style={[s.toast, l.toast]} accessibilityLiveRegion="polite" key={toast.key}>
          <Text style={[s.toastText, l.toastText]}>{toast.message}</Text>
          {toast.undo ? (
            <Pressable
              onPress={() => { toast.undo?.(); setToast(null); }}
              accessibilityRole="button"
              accessibilityLabel="Undo"
              style={({ pressed }) => [l.toastBtn, pressed && s.btnPressed]}
            >
              <Text style={[s.btnText, { color: c.accent }]}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Modal visible={editing !== null} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        {editing ? (
          <ItemSheet
            key={editing.item.id}
            c={c}
            s={s}
            l={l}
            item={editing.item}
            isNew={editing.isNew}
            onClose={() => setEditing(null)}
            onSave={saveItem}
            onDelete={removeItem}
          />
        ) : null}
      </Modal>

      <Modal visible={menuOpen} animationType="slide" transparent onRequestClose={() => setMenuOpen(false)}>
        <MenuSheet
          c={c}
          s={s}
          l={l}
          sampleCount={catalog.filter((it) => !it.isCustom).length}
          onClose={() => setMenuOpen(false)}
          onReset={doReset}
          onClear={doClearSamples}
        />
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- Item detail / edit sheet ---------- */

interface SheetProps {
  c: ReturnType<typeof useColors>;
  s: ReturnType<typeof makeStyles>;
  l: ReturnType<typeof makeLocal>;
}

function ItemSheet(props: SheetProps & {
  item: CatalogItem;
  isNew: boolean;
  onClose: () => void;
  onSave: (item: CatalogItem) => Promise<void>;
  onDelete: (item: CatalogItem) => Promise<void>;
}): JSX.Element {
  const { c, s, l, item, isNew, onClose, onSave, onDelete } = props;
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<Category>(item.category);
  const [unit, setUnit] = useState(item.unit);
  const [priceText, setPriceText] = useState(isNew ? '' : item.defaultPrice.toFixed(2));
  const [taxable, setTaxable] = useState(item.taxable);
  const [note, setNote] = useState(item.note);
  const [touched, setTouched] = useState<{ name?: boolean; unit?: boolean; price?: boolean }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameError = name.trim() === '' ? 'Enter an item name' : '';
  const unitError = unit.trim() === '' ? 'Enter a unit, for example gallon or yard' : '';
  const price = parsePrice(priceText);
  const priceError = price === null ? 'Enter a price of 0 or more, using numbers only' : '';

  const submit = async () => {
    setTouched({ name: true, unit: true, price: true });
    if (nameError || unitError || priceError || price === null || busy) return;
    setBusy(true);
    await onSave({
      ...item,
      name: name.trim(),
      category,
      unit: unit.trim(),
      defaultPrice: price,
      taxable,
      note: note.trim(),
    });
    setBusy(false);
  };

  // Memoized so its inputs keep focus while typing (a new component type each render would remount them).
  const FieldBlock = useMemo(
    () =>
      function FieldBlockInner(p: { label: string; error?: string; helper?: string; children: React.ReactNode }) {
        return (
          <View style={l.fieldBlock}>
            <Text style={s.label}>{p.label}</Text>
            {p.children}
            {p.error ? <Text style={s.errorText} accessibilityLiveRegion="polite">{p.error}</Text> : p.helper ? <Text style={[s.muted, { fontSize: t.fontSize.xs }]}>{p.helper}</Text> : null}
          </View>
        );
      },
    [s, l]
  );

  return (
    <KeyboardAvoidingView style={l.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={l.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close without saving" />
      <View style={l.sheet}>
        <View style={l.sheetHeader}>
          <Text style={[s.title, l.sheetTitle]} accessibilityRole="header">{isNew ? 'New catalog item' : 'Item details'}</Text>
          <IconBtn c={c} s={s} icon="x" label="Close" onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={l.sheetBody}>
          <FieldBlock label="Name" error={touched.name ? nameError : ''}>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={() => setTouched((x) => ({ ...x, name: true }))}
              placeholder="Epoxy resin, gallon"
              placeholderTextColor={c.inkMuted}
              style={[s.input, touched.name && nameError ? s.inputError : null]}
              accessibilityLabel="Item name"
              multiline
            />
          </FieldBlock>

          <View style={l.fieldBlock}>
            <Text style={s.label}>Category</Text>
            <View style={l.wrapRow}>
              {CATEGORY_ORDER.map((cat) => {
                const active = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Category ${CATEGORY_META[cat].short}`}
                    style={({ pressed }) => [s.chip, l.chip, active && s.chipActive, pressed && s.btnPressed]}
                  >
                    <Text style={[s.btnText, { fontSize: t.fontSize.sm }, active && s.btnTextOnAccent]}>{CATEGORY_META[cat].short}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={l.twoCol}>
            <View style={l.col}>
              <FieldBlock label="Default price" error={touched.price ? priceError : ''}>
                <TextInput
                  value={priceText}
                  onChangeText={setPriceText}
                  onBlur={() => setTouched((x) => ({ ...x, price: true }))}
                  placeholder="0.00"
                  placeholderTextColor={c.inkMuted}
                  keyboardType="decimal-pad"
                  style={[s.input, s.money, touched.price && priceError ? s.inputError : null]}
                  accessibilityLabel="Default price"
                />
              </FieldBlock>
            </View>
            <View style={l.col}>
              <FieldBlock label="Unit" error={touched.unit ? unitError : ''}>
                <TextInput
                  value={unit}
                  onChangeText={setUnit}
                  onBlur={() => setTouched((x) => ({ ...x, unit: true }))}
                  placeholder="gallon"
                  placeholderTextColor={c.inkMuted}
                  autoCapitalize="none"
                  style={[s.input, touched.unit && unitError ? s.inputError : null]}
                  accessibilityLabel="Unit of measure"
                />
              </FieldBlock>
            </View>
          </View>

          <View style={[l.wrapRow, l.fieldBlock]}>
            {UNIT_SUGGESTIONS.map((u) => {
              const active = unit.trim().toLowerCase() === u;
              return (
                <Pressable
                  key={u}
                  onPress={() => setUnit(u)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use unit ${u}`}
                  style={({ pressed }) => [s.chip, l.chip, active && s.chipActive, pressed && s.btnPressed]}
                >
                  <Text style={[s.btnText, { fontSize: t.fontSize.sm }, active && s.btnTextOnAccent]}>{u}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[l.switchRow, l.fieldBlock]}>
            <View style={l.rowMain}>
              <Text style={s.body}>Taxable</Text>
              <Text style={s.muted}>New material lines start with this setting</Text>
            </View>
            <Switch
              value={taxable}
              onValueChange={setTaxable}
              accessibilityLabel="Taxable"
              trackColor={{ false: c.line, true: c.accent }}
              thumbColor={c.surface}
            />
          </View>

          <FieldBlock label="Usage note" helper="Shown when you pick this item, for example where it can be used">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Required below the waterline"
              placeholderTextColor={c.inkMuted}
              style={[s.input, l.noteInput]}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Usage note"
            />
          </FieldBlock>

          <Text style={[s.muted, l.hint]}>
            Price changes apply to new invoices only. Invoices you already made keep their own prices.
          </Text>

          <View style={l.actions}>
            <Btn c={c} s={s} label={isNew ? 'Add item' : 'Save changes'} variant="primary" onPress={submit} disabled={busy} grow />
          </View>

          {!isNew ? (
            confirmDelete ? (
              <View style={l.confirmBox}>
                <Text style={s.body}>Delete {item.name}? Invoice lines that used it stay unchanged.</Text>
                <View style={l.actions}>
                  <Btn c={c} s={s} label="Keep item" variant="secondary" onPress={() => setConfirmDelete(false)} grow />
                  <Btn c={c} s={s} label="Delete" variant="danger" onPress={() => onDelete(item)} grow />
                </View>
              </View>
            ) : (
              <View style={l.deleteRow}>
                <Btn c={c} s={s} label="Delete item" variant="tertiary" danger onPress={() => setConfirmDelete(true)} icon="trash-2" />
              </View>
            )
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------- Menu sheet: reset / clear samples ---------- */

function MenuSheet(props: SheetProps & {
  sampleCount: number;
  onClose: () => void;
  onReset: () => Promise<void>;
  onClear: () => Promise<void>;
}): JSX.Element {
  const { c, s, l, sampleCount, onClose, onReset, onClear } = props;
  const [step, setStep] = useState<'menu' | 'reset' | 'clear'>('menu');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
    setStep('menu');
  };

  const Option = (p: { icon: React.ComponentProps<typeof Feather>['name']; title: string; text: string; onPress: () => void; disabled?: boolean }) => (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      accessibilityRole="button"
      accessibilityLabel={p.title}
      style={({ pressed }) => [l.optionRow, pressed && l.rowPressed, p.disabled && s.btnDisabled]}
    >
      <View style={l.optionIcon}><Feather name={p.icon} size={20} color={c.accent} /></View>
      <View style={l.rowMain}>
        <Text style={s.body}>{p.title}</Text>
        <Text style={s.muted}>{p.text}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={l.modalRoot}>
      <Pressable style={l.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      <View style={l.sheet}>
        <View style={l.sheetHeader}>
          <Text style={[s.title, l.sheetTitle]} accessibilityRole="header">Catalog options</Text>
          <IconBtn c={c} s={s} icon="x" label="Close" onPress={onClose} />
        </View>
        <View style={l.sheetBody}>
          {step === 'menu' ? (
            <>
              <Option
                icon="rotate-ccw"
                title="Reset to defaults"
                text="Restore the starter marine list and its default prices"
                onPress={() => setStep('reset')}
              />
              <Option
                icon="trash-2"
                title="Clear sample items"
                text={sampleCount > 0 ? `Remove ${sampleCount} seeded items, keep your custom parts` : 'No sample items left to remove'}
                onPress={() => setStep('clear')}
                disabled={sampleCount === 0}
              />
            </>
          ) : step === 'reset' ? (
            <View style={l.confirmBox}>
              <Text style={s.body}>Reset the catalog to the starter list? Edited prices and notes on seeded items go back to their defaults. Saved invoices are not changed.</Text>
              <View style={l.actions}>
                <Btn c={c} s={s} label="Cancel" variant="secondary" onPress={() => setStep('menu')} grow />
                <Btn c={c} s={s} label="Reset catalog" variant="primary" onPress={() => run(onReset)} disabled={busy} grow />
              </View>
            </View>
          ) : (
            <View style={l.confirmBox}>
              <Text style={s.body}>Remove all {sampleCount} sample items? Your custom parts stay, and saved invoices are not changed. You can undo right after, or reset to defaults later.</Text>
              <View style={l.actions}>
                <Btn c={c} s={s} label="Cancel" variant="secondary" onPress={() => setStep('menu')} grow />
                <Btn c={c} s={s} label="Clear samples" variant="danger" onPress={() => run(onClear)} disabled={busy} grow />
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/* ---------- Small local controls built from the shared theme styles ---------- */

function Btn(props: {
  c: ReturnType<typeof useColors>;
  s: ReturnType<typeof makeStyles>;
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary' | 'tertiary' | 'danger';
  disabled?: boolean;
  grow?: boolean;
  danger?: boolean;
  icon?: React.ComponentProps<typeof Feather>['name'];
}): JSX.Element {
  const { c, s, label, onPress, variant, disabled, grow, danger, icon } = props;
  const base = variant === 'primary' ? s.btnPrimary : variant === 'secondary' ? s.btnSecondary : variant === 'danger' ? s.btnDanger : s.btnTertiary;
  const onAccent = variant === 'primary' || variant === 'danger';
  const textColor = onAccent ? (variant === 'danger' ? '#FFFFFF' : c.accentInk) : danger ? c.danger : c.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.btn,
        base,
        grow ? { flex: 1 } : null,
        pressed && s.btnPressed,
        pressed && { transform: [{ scale: 0.97 }] },
        disabled && s.btnDisabled,
      ]}
    >
      {icon ? <Feather name={icon} size={20} color={textColor} style={{ marginRight: t.space[2] }} /> : null}
      <Text style={[s.btnText, { color: textColor }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function IconBtn(props: {
  c: ReturnType<typeof useColors>;
  s: ReturnType<typeof makeStyles>;
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  filled?: boolean;
}): JSX.Element {
  const { c, s, icon, label, onPress, filled } = props;
  return (
    <Pressable
      onPress={() => { buzz('light'); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.iconBtn, filled && s.btnPrimary, pressed && s.btnPressed, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <Feather name={icon} size={22} color={filled ? c.accentInk : c.ink} />
    </Pressable>
  );
}

/* ---------- Layout styles (tokens only) ---------- */

function makeLocal(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.space[4], paddingTop: t.space[2], paddingBottom: t.space[2] },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
    searchWrap: { paddingHorizontal: t.space[4], paddingBottom: t.space[2] },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
    searchInput: { flex: 1, minHeight: t.hit, color: c.ink, fontSize: t.fontSize.md },
    clearBtn: { width: t.hit, height: t.hit, alignItems: 'center', justifyContent: 'center', marginRight: -t.space[3] },
    chipRow: { paddingHorizontal: t.space[4], paddingBottom: t.space[3], gap: t.space[2], alignItems: 'center' },
    chip: { minHeight: t.hit },
    listContent: { paddingBottom: t.space[7], flexGrow: 1 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: t.space[2], paddingHorizontal: t.space[4], paddingVertical: t.space[2], backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.line },
    sectionTitle: { flex: 1, fontSize: t.fontSize.md, fontWeight: t.fontWeight.bold, color: c.ink },
    rowMain: { flex: 1, paddingRight: t.space[3] },
    rowMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space[2], marginTop: t.space[1] },
    rowPressed: { backgroundColor: c.accentSoft },
    price: { marginRight: t.space[2], textAlign: 'right', fontSize: t.fontSize.md },
    badge: { fontSize: t.fontSize.xs, color: c.accent, fontWeight: t.fontWeight.medium },
    badgeMuted: { fontSize: t.fontSize.xs, color: c.inkMuted, fontWeight: t.fontWeight.medium },
    skeletonWrap: { padding: t.space[4], gap: t.space[3] },
    skeletonRow: { height: 56 },
    emptyActions: { flexDirection: 'row', gap: t.space[3], marginTop: t.space[3], flexWrap: 'wrap', justifyContent: 'center' },
    toast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toastText: { flex: 1 },
    toastBtn: { minHeight: t.hit, minWidth: t.hit, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.space[3], marginLeft: t.space[2], backgroundColor: c.surface, borderRadius: t.radius.control },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000', opacity: 0.45 },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: t.space[4], borderTopRightRadius: t.space[4], maxHeight: '92%', paddingBottom: t.space[4] },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: t.space[4], paddingRight: t.space[2], paddingTop: t.space[3], paddingBottom: t.space[2] },
    sheetTitle: { flex: 1, fontSize: t.fontSize.lg },
    sheetBody: { paddingHorizontal: t.space[4], paddingBottom: t.space[5] },
    fieldBlock: { marginBottom: t.space[4] },
    twoCol: { flexDirection: 'row', gap: t.space[3] },
    col: { flex: 1 },
    wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: t.radius.control, borderWidth: 1, borderColor: c.line, paddingHorizontal: t.space[3], paddingVertical: t.space[2], minHeight: t.hit + t.space[2] },
    noteInput: { minHeight: 96, paddingTop: t.space[3] },
    hint: { marginBottom: t.space[4] },
    actions: { flexDirection: 'row', gap: t.space[3], marginTop: t.space[2] },
    deleteRow: { alignItems: 'center', marginTop: t.space[3] },
    confirmBox: { backgroundColor: c.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: c.line, padding: t.space[4], marginTop: t.space[3], gap: t.space[2] },
    optionRow: { flexDirection: 'row', alignItems: 'center', minHeight: t.hit + t.space[4], paddingVertical: t.space[2], gap: t.space[3], borderBottomWidth: 1, borderBottomColor: c.line },
    optionIcon: { width: t.hit, height: t.hit, borderRadius: t.radius.control, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  });
}
