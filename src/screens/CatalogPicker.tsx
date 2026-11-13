import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { Chip, EmptyState, Field, IconButton, ListRow } from '../ui';
import { makeStyles, tokens, useColors } from '../theme';
import type { CatalogItem, CatalogPickerProps, Category } from '../types';

const CATEGORY_ORDER: Category[] = ['resin', 'reinforcement', 'gelcoat', 'consumable', 'hardware'];

const CATEGORY_LABEL: Record<Category, string> = {
  resin: 'Resins',
  reinforcement: 'Reinforcements',
  gelcoat: 'Gelcoat & finishing',
  consumable: 'Consumables',
  hardware: 'Hardware',
};

const CATEGORY_ICON: Record<Category, string> = {
  resin: 'droplet',
  reinforcement: 'layers',
  gelcoat: 'edit-3',
  consumable: 'package',
  hardware: 'tool',
};

const priceFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Filter = Category | 'all';

export default function CatalogPicker({ visible, onClose, onPick }: CatalogPickerProps) {
  const { data } = useStore();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Start fresh every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setQuery('');
      setFilter('all');
    }
  }, [visible]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of data.catalog) m[it.category] = (m[it.category] ?? 0) + 1;
    return m;
  }, [data.catalog]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.catalog
      .filter((it) => filter === 'all' || it.category === filter)
      .filter((it) => {
        if (!q) return true;
        const hay = `${it.name} ${it.unit} ${it.note} ${CATEGORY_LABEL[it.category]}`.toLowerCase();
        return q.split(/\s+/).every((w) => hay.includes(w));
      })
      .sort((a, b) => {
        const ca = CATEGORY_ORDER.indexOf(a.category);
        const cb = CATEGORY_ORDER.indexOf(b.category);
        return ca !== cb ? ca - cb : a.name.localeCompare(b.name);
      });
  }, [data.catalog, query, filter]);

  const pick = (item: CatalogItem) => {
    onPick(item);
    onClose();
  };

  const renderItem = ({ item }: { item: CatalogItem }) => (
    <ListRow
      icon={CATEGORY_ICON[item.category]}
      title={item.name}
      subtitle={`${CATEGORY_LABEL[item.category]} · per ${item.unit}${item.taxable ? '' : ' · non-taxable'}`}
      value={priceFormat.format(item.defaultPrice)}
      right={<Feather name="plus-circle" size={22} color={c.accent} />}
      chevron={false}
      onPress={() => pick(item)}
      accessibilityLabel={`Add ${item.name}, ${priceFormat.format(item.defaultPrice)} per ${item.unit}`}
    />
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close catalog"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={{
              height: '100%',
              maxHeight: 640,
              minHeight: 420,
              backgroundColor: c.bg,
              borderTopLeftRadius: tokens.radius.card + 4,
              borderTopRightRadius: tokens.radius.card + 4,
              paddingBottom: Math.max(insets.bottom, tokens.space[3]),
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: tokens.space[4],
                paddingRight: tokens.space[2],
                paddingTop: tokens.space[2],
              }}
            >
              <Text style={[s.body, { fontSize: tokens.fontSize.lg, fontWeight: tokens.fontWeight.bold }]} accessibilityRole="header">
                Add material
              </Text>
              <IconButton name="x" label="Close catalog" onPress={onClose} />
            </View>

            <View style={{ paddingHorizontal: tokens.space[4], paddingTop: tokens.space[2] }}>
              <Field
                label="Search catalog"
                value={query}
                onChangeText={setQuery}
                placeholder="Epoxy, biaxial, gelcoat…"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                containerStyle={{ marginBottom: tokens.space[2] }}
              />
            </View>

            <View style={{ flexGrow: 0 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingHorizontal: tokens.space[4],
                  paddingVertical: tokens.space[2],
                  gap: tokens.space[2],
                }}
              >
                <Chip label={`All ${data.catalog.length}`} active={filter === 'all'} onPress={() => setFilter('all')} />
                {CATEGORY_ORDER.filter((cat) => (counts[cat] ?? 0) > 0).map((cat) => (
                  <Chip
                    key={cat}
                    label={`${CATEGORY_LABEL[cat]} ${counts[cat]}`}
                    active={filter === cat}
                    onPress={() => setFilter(cat)}
                  />
                ))}
              </ScrollView>
            </View>

            <FlatList
              data={items}
              keyExtractor={(it) => it.id}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1, borderTopWidth: 1, borderTopColor: c.line }}
              contentContainerStyle={items.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : undefined}
              ListEmptyComponent={
                data.catalog.length === 0 ? (
                  <EmptyState
                    icon="package"
                    title="Catalog is empty"
                    text="Add parts or reset to defaults in the Catalog tab, or enter a custom part on the invoice."
                  />
                ) : (
                  <EmptyState
                    icon="search"
                    title="No matching parts"
                    text={query.trim() ? `Nothing matches “${query.trim()}”.` : 'No parts in this category.'}
                    actionLabel="Clear filters"
                    onAction={() => {
                      setQuery('');
                      setFilter('all');
                    }}
                  />
                )
              }
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
