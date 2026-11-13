import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { makeStyles, tokens, useColors } from '../theme';
import type { Settings } from '../types';

type FormState = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  licenseNo: string;
  defaultHourlyRate: string;
  defaultTaxRate: string;
  defaultMarkupPct: string;
  paymentTerms: string;
  portalBaseUrl: string;
  zelleHandle: string;
  stripePaymentUrl: string;
  relayBankName: string;
  relayRoutingNumber: string;
  relayAccountNumber: string;
  googleReviewUrl: string;
  yelpReviewUrl: string;
  facebookReviewUrl: string;
  nextdoorReviewUrl: string;
};

type Errors = Partial<Record<keyof FormState, string>>;

const NUMERIC: (keyof FormState)[] = ['defaultHourlyRate', 'defaultTaxRate', 'defaultMarkupPct'];
const URL_FIELDS: (keyof FormState)[] = ['portalBaseUrl', 'stripePaymentUrl', 'googleReviewUrl', 'yelpReviewUrl', 'facebookReviewUrl', 'nextdoorReviewUrl'];

function numToText(n: number): string {
  return Number.isFinite(n) ? String(n) : '';
}

function toForm(s: Settings): FormState {
  return {
    businessName: s.businessName ?? '',
    address: s.address ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    licenseNo: s.licenseNo ?? '',
    defaultHourlyRate: numToText(s.defaultHourlyRate),
    defaultTaxRate: numToText(s.defaultTaxRate),
    defaultMarkupPct: numToText(s.defaultMarkupPct),
    paymentTerms: s.paymentTerms ?? '',
    portalBaseUrl: s.portalBaseUrl ?? '',
    zelleHandle: s.zelleHandle ?? '',
    stripePaymentUrl: s.stripePaymentUrl ?? '',
    relayBankName: s.relayBankName ?? '',
    relayRoutingNumber: s.relayRoutingNumber ?? '',
    relayAccountNumber: s.relayAccountNumber ?? '',
    googleReviewUrl: s.googleReviewUrl ?? '',
    yelpReviewUrl: s.yelpReviewUrl ?? '',
    facebookReviewUrl: s.facebookReviewUrl ?? '',
    nextdoorReviewUrl: s.nextdoorReviewUrl ?? '',
  };
}

/** Parses a non-negative decimal; returns null when it is not a valid number. */
function parseNum(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function validateField(key: keyof FormState, form: FormState): string | undefined {
  if (NUMERIC.includes(key)) {
    const raw = form[key];
    if (!raw.trim()) return 'Enter a number, or 0 for none.';
    const n = parseNum(raw);
    if (n === null) return 'Use digits only, no negative numbers.';
    if (key === 'defaultHourlyRate' && n > 100000) return 'That rate looks too high.';
    if (key !== 'defaultHourlyRate' && n > 100) return 'Enter a percentage from 0 to 100.';
    return undefined;
  }
  if (key === 'email') {
    const v = form.email.trim();
    if (v && !/^\S+@\S+\.\S+$/.test(v)) return 'Enter an email like name@example.com.';
  }
  if (URL_FIELDS.includes(key)) {
    const v = form[key].trim();
    if (v && !/^https?:\/\/\S+$/.test(v)) return 'Enter a full link starting with https://';
  }
  return undefined;
}

function validateAll(form: FormState): Errors {
  const errs: Errors = {};
  (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
    const e = validateField(k, form);
    if (e) errs[k] = e;
  });
  return errs;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function SettingsScreen(): JSX.Element {
  const { data, ready, saveSettings } = useStore();
  const c = useColors();
  const base = useMemo(() => makeStyles(c), [c]);
  const t = tokens;

  const [form, setForm] = useState<FormState>(() => toForm(data.settings));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  // Load stored settings into the form once the database is ready (and after saves).
  useEffect(() => {
    if (ready && !loadedRef.current) {
      loadedRef.current = true;
      setForm(toForm(data.settings));
    }
  }, [ready, data.settings]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const saved = useMemo(() => toForm(data.settings), [data.settings]);
  const dirty = (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== saved[k]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const set = (key: keyof FormState) => (v: string) => {
    setForm((f) => ({ ...f, [key]: v }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const blur = (key: keyof FormState) => () => {
    const msg = validateField(key, form);
    setErrors((e) => ({ ...e, [key]: msg }));
  };

  const onSave = async () => {
    if (saving) return;
    const errs = validateAll(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      showToast('Fix the highlighted fields to save.');
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {}
      return;
    }
    const next: Settings = {
      businessName: form.businessName.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      licenseNo: form.licenseNo.trim(),
      defaultHourlyRate: round2(parseNum(form.defaultHourlyRate) ?? 0),
      defaultTaxRate: round2(parseNum(form.defaultTaxRate) ?? 0),
      defaultMarkupPct: round2(parseNum(form.defaultMarkupPct) ?? 0),
      paymentTerms: form.paymentTerms.trim(),
      portalBaseUrl: form.portalBaseUrl.trim().replace(/\/+$/, ''),
      zelleHandle: form.zelleHandle.trim(),
      stripePaymentUrl: form.stripePaymentUrl.trim(),
      relayBankName: form.relayBankName.trim(),
      relayRoutingNumber: form.relayRoutingNumber.trim(),
      relayAccountNumber: form.relayAccountNumber.trim(),
      googleReviewUrl: form.googleReviewUrl.trim(),
      yelpReviewUrl: form.yelpReviewUrl.trim(),
      facebookReviewUrl: form.facebookReviewUrl.trim(),
      nextdoorReviewUrl: form.nextdoorReviewUrl.trim(),
    };
    setSaving(true);
    try {
      await saveSettings(next);
      setForm(toForm(next));
      showToast('Settings saved. New invoices will use them.');
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } catch {
      showToast("Couldn't save settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const privacyUrl = (globalThis as { REMIX_PRIVACY_URL?: string }).REMIX_PRIVACY_URL;

  const s = useMemo(
    () =>
      StyleSheet.create({
        header: { paddingHorizontal: t.space[4], paddingTop: t.space[3], paddingBottom: t.space[2] },
        content: { padding: t.space[4], paddingBottom: t.space[6], gap: t.space[5] },
        sectionTitle: { fontSize: t.fontSize.md, fontWeight: t.fontWeight.bold, color: c.ink, marginBottom: t.space[3] },
        sectionHint: { fontSize: t.fontSize.sm, color: c.inkMuted, marginBottom: t.space[3], lineHeight: t.lineHeight.sm },
        field: { marginBottom: t.space[3] },
        row: { flexDirection: 'row', gap: t.space[3] },
        half: { flex: 1 },
        multiline: { minHeight: 88, paddingTop: t.space[3], textAlignVertical: 'top' },
        suffixWrap: { flexDirection: 'row', alignItems: 'center' },
        footer: {
          paddingHorizontal: t.space[4],
          paddingVertical: t.space[3],
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.line,
        },
        infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space[3] },
        infoText: { flex: 1, fontSize: t.fontSize.sm, color: c.inkMuted, lineHeight: t.lineHeight.sm },
        linkRow: { minHeight: t.hit, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        btnLabelRow: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
      }),
    [c, t]
  );

  const renderField = (
    key: keyof FormState,
    label: string,
    opts: {
      placeholder?: string;
      helper?: string;
      multiline?: boolean;
      keyboardType?: 'default' | 'decimal-pad' | 'phone-pad' | 'email-address';
      autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
      suffix?: string;
    } = {}
  ) => {
    const err = errors[key];
    return (
      <View style={s.field}>
        <Text style={base.label} nativeID={`lbl-${key}`}>
          {label}
        </Text>
        <View style={s.suffixWrap}>
          <TextInput
            style={[
              base.input,
              opts.multiline ? s.multiline : null,
              err ? base.inputError : null,
              { flex: 1 },
            ]}
            value={form[key]}
            onChangeText={set(key)}
            onBlur={blur(key)}
            placeholder={opts.placeholder}
            placeholderTextColor={c.inkMuted}
            multiline={opts.multiline}
            keyboardType={opts.keyboardType ?? 'default'}
            autoCapitalize={opts.autoCapitalize ?? 'sentences'}
            autoCorrect={false}
            accessibilityLabel={label}
            selectTextOnFocus={NUMERIC.includes(key)}
            {...(NUMERIC.includes(key) ? { numeric: true } : {})}
          />
          {opts.suffix ? (
            <Text style={[base.muted, { marginLeft: t.space[2], minWidth: 16 }]}>{opts.suffix}</Text>
          ) : null}
        </View>
        {err ? (
          <Text style={base.errorText} accessibilityLiveRegion="polite">
            {err}
          </Text>
        ) : opts.helper ? (
          <Text style={[base.muted, { fontSize: t.fontSize.xs, marginTop: t.space[1] }]}>{opts.helper}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={base.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Text style={base.title} accessibilityRole="header">
            Settings
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={base.card}>
            <Text style={s.sectionTitle} accessibilityRole="header">
              Business details
            </Text>
            <Text style={s.sectionHint}>Printed at the top of every invoice PDF.</Text>
            {renderField('businessName', 'Business name', {
              placeholder: 'Harbor Fiberglass & Repair',
              autoCapitalize: 'words',
            })}
            {renderField('address', 'Address', {
              placeholder: '12 Dockside Way\nPort Clyde, ME 04855',
              multiline: true,
              autoCapitalize: 'words',
            })}
            {renderField('licenseNo', 'License #', {
              placeholder: 'e.g. MR-20418',
              autoCapitalize: 'characters',
            })}
            {renderField('phone', 'Phone', { placeholder: '(207) 555-0142', keyboardType: 'phone-pad' })}
            {renderField('email', 'Email', {
              placeholder: 'shop@example.com',
              keyboardType: 'email-address',
              autoCapitalize: 'none',
            })}
          </View>

          <View style={base.card}>
            <Text style={s.sectionTitle} accessibilityRole="header">
              Invoice defaults
            </Text>
            <Text style={s.sectionHint}>
              Applied to each new invoice. Existing invoices keep their own rate, tax and markup.
            </Text>
            {renderField('defaultHourlyRate', 'Hourly labor rate', {
              placeholder: '85.00',
              keyboardType: 'decimal-pad',
              helper: 'Per hour, in your currency.',
            })}
            <View style={s.row}>
              <View style={s.half}>
                {renderField('defaultTaxRate', 'Tax rate', {
                  placeholder: '7',
                  keyboardType: 'decimal-pad',
                  suffix: '%',
                  helper: 'On taxable parts only.',
                })}
              </View>
              <View style={s.half}>
                {renderField('defaultMarkupPct', 'Parts markup', {
                  placeholder: '10',
                  keyboardType: 'decimal-pad',
                  suffix: '%',
                  helper: 'Added to parts subtotal.',
                })}
              </View>
            </View>
            {renderField('paymentTerms', 'Payment terms', {
              placeholder: 'Net 15. Payment due within 15 days of issue.',
              multiline: true,
            })}
          </View>

          <View style={base.card}>
            <Text style={s.sectionTitle} accessibilityRole="header">
              Payments
            </Text>
            <Text style={s.sectionHint}>
              Shown on the customer payment page. Zelle is the zero-fee option; add a Stripe Payment Link with ACH
              enabled for larger jobs.
            </Text>
            {renderField('portalBaseUrl', 'Customer portal web URL', {
              placeholder: 'https://pay.mobilemarinedoc.com',
              keyboardType: 'default',
              autoCapitalize: 'none',
              helper: 'Base domain where your hosted customer portal lives (used by the "Text link" button).',
            })}
            {renderField('zelleHandle', 'Zelle handle', {
              placeholder: 'info@mobilemarinedoc.com',
              keyboardType: 'email-address',
              autoCapitalize: 'none',
              helper: 'The email or phone registered with Zelle on your business bank account.',
            })}
            {renderField('stripePaymentUrl', 'Stripe Payment Link (ACH)', {
              placeholder: 'https://buy.stripe.com/…',
              keyboardType: 'default',
              autoCapitalize: 'none',
              helper: 'Create one free at stripe.com → Payment Links. Leave blank to hide this option.',
            })}
            {renderField('relayBankName', 'Relay bank name (for ACH / wires)', {
              placeholder: 'Relay Financial (Thread Bank)',
              autoCapitalize: 'words',
            })}
            <View style={s.row}>
              <View style={s.half}>
                {renderField('relayRoutingNumber', 'Relay ACH routing #', {
                  placeholder: '064209588',
                  keyboardType: 'decimal-pad',
                  autoCapitalize: 'none',
                  helper: 'Shown on customer portal & PDF when both routing & account are filled.',
                })}
              </View>
              <View style={s.half}>
                {renderField('relayAccountNumber', 'Relay account #', {
                  placeholder: 'Checking account #',
                  keyboardType: 'decimal-pad',
                  autoCapitalize: 'none',
                })}
              </View>
            </View>
          </View>

          <View style={base.card}>
            <Text style={s.sectionTitle} accessibilityRole="header">
              Review links
            </Text>
            <Text style={s.sectionHint}>
              After paying, happy customers get one-tap buttons for each link you add here. Blank ones are hidden.
            </Text>
            {renderField('googleReviewUrl', 'Google review link', {
              placeholder: 'https://g.page/r/…/review',
              autoCapitalize: 'none',
            })}
            {renderField('yelpReviewUrl', 'Yelp review link', {
              placeholder: 'https://www.yelp.com/writeareview/biz/…',
              autoCapitalize: 'none',
              helper: 'Claim your free listing at biz.yelp.com first.',
            })}
            {renderField('facebookReviewUrl', 'Facebook reviews link', {
              placeholder: 'https://www.facebook.com/…/reviews',
              autoCapitalize: 'none',
            })}
            {renderField('nextdoorReviewUrl', 'Nextdoor recommend link', {
              placeholder: 'https://nextdoor.com/pages/…/recommend/',
              autoCapitalize: 'none',
            })}
          </View>

          <View style={base.card}>
            <View style={s.infoRow}>
              <Feather name="hard-drive" size={20} color={c.accent} />
              <Text style={s.infoText}>
                Everything is stored on this device: catalog, clients and invoices. It all works without a signal.
              </Text>
            </View>
          </View>

          {privacyUrl ? (
            <Pressable
              onPress={() => {
                Linking.openURL(privacyUrl).catch(() => showToast("Couldn't open the privacy policy."));
              }}
              accessibilityRole="link"
              accessibilityLabel="Privacy policy"
              style={({ pressed }) => [s.linkRow, pressed && base.btnPressed]}
            >
              <Text style={base.body}>Privacy policy</Text>
              <Feather name="external-link" size={20} color={c.inkMuted} />
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            onPress={onSave}
            disabled={!dirty || saving}
            accessibilityRole="button"
            accessibilityLabel="Save settings"
            accessibilityState={{ disabled: !dirty || saving }}
            style={({ pressed }) => [
              base.btn,
              base.btnPrimary,
              (!dirty || saving) && base.btnDisabled,
              pressed && base.btnPressed,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <View style={s.btnLabelRow}>
              <Feather name={dirty ? 'save' : 'check'} size={20} color={c.accentInk} />
              <Text style={[base.btnText, base.btnTextOnAccent]} numberOfLines={1}>
                {saving ? 'Saving…' : dirty ? 'Save settings' : 'Saved'}
              </Text>
            </View>
          </Pressable>
        </View>

        {toast ? (
          <View style={[base.toast, { bottom: 88 }]} accessibilityLiveRegion="polite" pointerEvents="none">
            <Text style={base.toastText}>{toast}</Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
