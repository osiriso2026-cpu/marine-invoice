// Visual direction: chandlery workbench. Crisp, practical, sun-readable. Teal-blue accent #0B6E8A on cool blue-tinted neutrals. System fonts, bold totals, tabular numerals. Comfortable density, soft radius (10), no illustration. Follows system light/dark.
import { useColorScheme, StyleSheet } from 'react-native';

export const light = { bg: '#F3F6F7', surface: '#FFFFFF', ink: '#10252E', inkMuted: '#5A6E77', line: '#D3DDE1', accent: '#0B6E8A', accentInk: '#FFFFFF', accentSoft: '#DDEFF4', success: '#1E8E5A', successInk: '#17704A', warning: '#C77700', warningInk: '#8F5600', danger: '#C0392B', dangerSoft: '#F8E1DE' };
export const dark = { bg: '#0C171C', surface: '#14252C', ink: '#E6EFF2', inkMuted: '#93A8B1', line: '#26404A', accent: '#3BB3D1', accentInk: '#06232B', accentSoft: '#173844', success: '#3CC088', successInk: '#3CC088', warning: '#E3A03A', warningInk: '#E3A03A', danger: '#E5675A', dangerSoft: '#3A1F1C' };
export type Colors = typeof light;

export const tokens = {
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 26, hero: 32, display: 34 },
  lineHeight: { xs: 16, sm: 20, md: 22, lg: 26, xl: 32, hero: 40, display: 40 },
  fontWeight: { regular: '400', medium: '600', bold: '800' } as const,
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 },
  radius: { control: 10, card: 12, chip: 999 },
  hit: 44,
  motion: { fast: 120, base: 220, slow: 400 },
  elevation: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  numeric: { fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
};

export function useColors(): Colors { return useColorScheme() === 'dark' ? dark : light; }

export function makeStyles(c: Colors) {
  const t = tokens;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    btn: { minHeight: t.hit, paddingHorizontal: t.space[4], borderRadius: t.radius.control, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    btnPrimary: { backgroundColor: c.accent },
    btnSecondary: { backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.line },
    btnTertiary: { backgroundColor: 'transparent' },
    btnDanger: { backgroundColor: c.danger },
    btnPressed: { opacity: 0.75 },
    btnDisabled: { opacity: 0.4 },
    btnText: { fontSize: t.fontSize.md, fontWeight: t.fontWeight.medium, color: c.ink },
    btnTextOnAccent: { color: c.accentInk },
    iconBtn: { width: t.hit, height: t.hit, borderRadius: t.radius.control, alignItems: 'center', justifyContent: 'center' },
    card: { backgroundColor: c.surface, borderRadius: t.radius.card, padding: t.space[4], borderWidth: 1, borderColor: c.line, ...t.elevation },
    listRow: { minHeight: t.hit + 12, paddingVertical: t.space[3], paddingHorizontal: t.space[4], backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center' },
    input: { minHeight: t.hit, borderWidth: 1, borderColor: c.line, borderRadius: t.radius.control, paddingHorizontal: t.space[3], color: c.ink, backgroundColor: c.surface, fontSize: t.fontSize.md },
    inputError: { borderColor: c.danger },
    errorText: { color: c.danger, fontSize: t.fontSize.xs, marginTop: t.space[1] },
    label: { color: c.inkMuted, fontSize: t.fontSize.sm, marginBottom: t.space[1] },
    chip: { paddingHorizontal: t.space[3], minHeight: t.hit, borderRadius: t.radius.chip, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    tabItem: { flex: 1, minHeight: t.hit, alignItems: 'center', justifyContent: 'center' },
    tabItemActive: { borderTopWidth: 2, borderTopColor: c.accent },
    empty: { alignItems: 'center', padding: t.space[6] },
    emptyCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: t.space[4] },
    emptyTitle: { fontSize: t.fontSize.lg, fontWeight: t.fontWeight.bold, color: c.ink, textAlign: 'center' },
    emptyText: { fontSize: t.fontSize.md, color: c.inkMuted, textAlign: 'center', marginVertical: t.space[2] },
    skeleton: { backgroundColor: c.line, borderRadius: t.radius.control, opacity: 0.6 },
    toast: { position: 'absolute', left: t.space[4], right: t.space[4], bottom: t.space[6], backgroundColor: c.ink, padding: t.space[3], borderRadius: t.radius.control },
    toastText: { color: c.bg, fontSize: t.fontSize.sm },
    title: { fontSize: t.fontSize.xl, fontWeight: t.fontWeight.bold, color: c.ink },
    body: { fontSize: t.fontSize.md, color: c.ink },
    muted: { fontSize: t.fontSize.sm, color: c.inkMuted },
    money: { fontWeight: t.fontWeight.bold, color: c.ink, ...t.numeric },
  });
}
