import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useStore } from '../store';
import { computeTotals, lineTotal, money } from '../calc';
import { makeStyles, tokens, useColors } from '../theme';
import { Button } from '../ui';
import type { EditorProps, Invoice, LineItem, Review, Settings } from '../types';

interface PlatformLink {
  id: string;
  name: string;
  badge: string;
  url: string;
}

function reviewPlatforms(s: Settings): PlatformLink[] {
  const all: PlatformLink[] = [
    { id: 'google', name: 'Google', badge: 'Most important', url: s.googleReviewUrl },
    { id: 'yelp', name: 'Yelp', badge: 'Local search', url: s.yelpReviewUrl },
    { id: 'facebook', name: 'Facebook', badge: 'Boating groups', url: s.facebookReviewUrl },
    { id: 'nextdoor', name: 'Nextdoor', badge: 'Lower Keys', url: s.nextdoorReviewUrl },
  ];
  return all.filter((p) => p.url.trim().length > 0);
}

function stripeUrlFor(s: Settings, inv: Invoice): string {
  const base = s.stripePaymentUrl.trim();
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}client_reference_id=${encodeURIComponent(inv.number)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

function draftReview(s: Settings, inv: Invoice): string {
  const boat = inv.makeModel.trim() || inv.boatType.trim() || 'boat';
  const job = inv.repairDescription.trim();
  const jobPart = job ? ` ${job.endsWith('.') ? job : job + '.'}` : '';
  return `${s.businessName || 'Mobile Marine Doc'} took great care of our ${boat} right at the dock.${jobPart} Clean, professional work and fair pricing. Highly recommend to any boater in the Keys!`;
}

export default function CustomerPortalScreen({ route, navigation }: EditorProps): JSX.Element {
  const { invoiceId } = route.params;
  const store = useStore();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const settings = store.data.settings;

  const inv = store.data.invoices.find((i) => i.id === invoiceId);
  const lines = useMemo(
    () =>
      store.data.lines
        .filter((l) => l.invoiceId === invoiceId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.data.lines, invoiceId],
  );
  const existingReview = store.reviews.find((r) => r.invoiceId === invoiceId);
  const claim = inv ? store.paymentClaims[inv.id] : undefined;

  const [copiedMemo, setCopiedMemo] = useState(false);
  const [copiedRouting, setCopiedRouting] = useState(false);
  const [copiedAcct, setCopiedAcct] = useState(false);
  const [rating, setRating] = useState(existingReview?.rating ?? 5);
  const [reviewText, setReviewText] = useState(existingReview?.text ?? '');
  const [reviewSubmitted, setReviewSubmitted] = useState(!!existingReview);
  const [copiedReview, setCopiedReview] = useState(false);
  const [posted, setPosted] = useState<string[]>([]);

  // When the page is opened by direct link, storage finishes loading after mount; pick up the stored review then.
  const syncedReviewId = React.useRef<string | null>(existingReview?.id ?? null);
  React.useEffect(() => {
    if (existingReview && syncedReviewId.current !== existingReview.id) {
      syncedReviewId.current = existingReview.id;
      setRating(existingReview.rating);
      setReviewText(existingReview.text);
      setReviewSubmitted(true);
    }
  }, [existingReview]);

  const platforms = reviewPlatforms(settings);
  const sectionTitle = {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: c.ink,
    lineHeight: tokens.lineHeight.lg,
  } as const;

  if (!store.ready) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <View style={{ padding: tokens.space[4], gap: tokens.space[3] }}>
          <View style={[s.skeleton, { height: 120 }]} />
          <View style={[s.skeleton, { height: 200 }]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!inv) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <View style={[s.empty, { flex: 1, justifyContent: 'center' }]}>
          <View style={s.emptyCircle}>
            <Feather name="file-minus" size={32} color={c.accent} />
          </View>
          <Text style={s.emptyTitle}>Invoice not found</Text>
          <Text style={s.emptyText}>
            This link may be out of date. Call {settings.phone || 'us'} and we will resend it.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const totals = computeTotals(inv, lines);
  const paid = inv.status === 'paid';
  const boatLabel = [inv.makeModel.trim() || inv.boatType.trim(), inv.hullId.trim() ? `HIN ${inv.hullId.trim()}` : '']
    .filter(Boolean)
    .join(' · ');
  const memo = `${inv.number}${inv.makeModel ? ' - ' + inv.makeModel : ''}`;
  const stripeUrl = stripeUrlFor(settings, inv);

  const onCopyMemo = async () => {
    if (await copyText(memo)) {
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 3000);
    }
  };

  const onCopyRouting = async () => {
    if (await copyText(settings.relayRoutingNumber.trim())) {
      setCopiedRouting(true);
      setTimeout(() => setCopiedRouting(false), 3000);
    }
  };

  const onCopyAccount = async () => {
    if (await copyText(settings.relayAccountNumber.trim())) {
      setCopiedAcct(true);
      setTimeout(() => setCopiedAcct(false), 3000);
    }
  };

  const onZelleSent = () => {
    void store.claimPayment(inv.id, 'Zelle');
  };

  const onRelayAchSent = () => {
    void store.claimPayment(inv.id, 'Relay ACH / Wire');
  };

  const onStripe = () => {
    void store.claimPayment(inv.id, 'Bank transfer (ACH)');
    Linking.openURL(stripeUrl).catch(() => undefined);
  };

  const onSubmitReview = async () => {
    const text = reviewText.trim();
    if (!text) return;
    const review: Review = {
      id: `rev-${inv.id}`,
      invoiceId: inv.id,
      rating,
      text,
      isPrivate: rating <= 3,
      createdAt: Date.now(),
    };
    await store.saveReview(review);
    if (rating >= 4) setCopiedReview(await copyText(text));
    setReviewSubmitted(true);
  };

  const onLaunchPlatform = async (p: PlatformLink) => {
    setCopiedReview(await copyText(reviewText.trim()));
    setPosted((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
    Linking.openURL(p.url).catch(() => undefined);
  };

  const showPublicFunnel = reviewSubmitted && rating >= 4 && platforms.length > 0;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: tokens.space[4], paddingBottom: tokens.space[7], gap: tokens.space[4] }}
        keyboardShouldPersistTaps="handled"
      >
        {navigation.canGoBack() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to invoice editor"
            onPress={() => navigation.goBack()}
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: tokens.hit }}
          >
            <Feather name="chevron-left" size={22} color={c.accent} />
            <Text style={[s.body, { color: c.accent }]}>Owner view</Text>
            <Text style={[s.muted, { marginLeft: tokens.space[2] }]}>· customers see this page</Text>
          </Pressable>
        ) : null}

        {/* Business header */}
        <View style={[s.card, { backgroundColor: '#10252E', borderColor: '#10252E' }]}>
          <Text style={{ color: '#7FD4EA', fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.bold, letterSpacing: 1.2 }}>
            OFFICIAL SERVICE INVOICE
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: tokens.fontSize.xl, fontWeight: tokens.fontWeight.bold, marginTop: tokens.space[1] }}>
            {settings.businessName || 'Mobile Marine Doc'}
          </Text>
          <Text style={{ color: '#D3DDE1', fontSize: tokens.fontSize.sm, marginTop: 2 }}>
            {[settings.address, settings.phone].filter(Boolean).join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: tokens.space[4], gap: tokens.space[3] }}>
            <View>
              <Text style={{ color: '#D3DDE1', fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.medium }}>{inv.number}</Text>
              {inv.issueDate || inv.dueDate ? (
                <Text style={{ color: '#93A8B1', fontSize: tokens.fontSize.xs, marginTop: 2 }}>
                  {[inv.issueDate ? `Issued ${inv.issueDate}` : '', inv.dueDate ? `Due ${inv.dueDate}` : ''].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: tokens.fontSize.hero, fontWeight: tokens.fontWeight.bold, ...tokens.numeric }}>
              {money(totals.total)}
            </Text>
          </View>
        </View>

        {/* Prepared for + line items (read-only) */}
        <View style={s.card}>
          <Text style={[s.muted, { textTransform: 'uppercase', fontSize: tokens.fontSize.xs, letterSpacing: 1 }]}>Prepared for</Text>
          <Text style={[s.body, { fontWeight: tokens.fontWeight.bold, fontSize: tokens.fontSize.lg }]}>
            {inv.clientName.trim() || 'Valued Customer'}
          </Text>
          {boatLabel ? <Text style={s.muted}>{boatLabel}</Text> : null}
          {inv.repairDescription.trim() ? (
            <Text style={[s.body, { marginTop: tokens.space[2] }]}>{inv.repairDescription.trim()}</Text>
          ) : null}

          <View style={{ marginTop: tokens.space[3], borderTopWidth: 1, borderTopColor: c.line }}>
            {lines.map((l: LineItem) => (
              <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: tokens.space[2], borderBottomWidth: 1, borderBottomColor: c.line, gap: tokens.space[3] }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.body}>{l.description || (l.type === 'labor' ? 'Labor' : 'Materials')}</Text>
                  <Text style={[s.muted, { fontSize: tokens.fontSize.xs }]}>
                    {l.type === 'labor' ? 'Labor' : 'Materials'} · {l.qty} {l.unit} × {money(l.unitPrice)}
                  </Text>
                </View>
                <Text style={s.money}>{money(lineTotal(l))}</Text>
              </View>
            ))}
            {[
              { k: 'Labor', v: totals.labor },
              { k: 'Parts & materials', v: totals.parts },
              ...(totals.markup > 0 ? [{ k: 'Shop supplies & markup', v: totals.markup }] : []),
              ...(totals.tax > 0 ? [{ k: 'Sales tax', v: totals.tax }] : []),
            ].map((r) => (
              <View key={r.k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: tokens.space[1] }}>
                <Text style={s.muted}>{r.k}</Text>
                <Text style={[s.money, { fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.medium }]}>{money(r.v)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: tokens.space[2], marginTop: tokens.space[1], borderTopWidth: 1, borderTopColor: c.line }}>
              <Text style={[s.body, { fontWeight: tokens.fontWeight.bold }]}>Total due — no hidden fees</Text>
              <Text style={[s.money, { fontSize: tokens.fontSize.lg, color: c.accent }]}>{money(totals.total)}</Text>
            </View>
          </View>
        </View>

        {/* Payment */}
        {paid ? (
          <View style={[s.card, { borderColor: c.success, backgroundColor: c.accentSoft }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
              <Feather name="check-circle" size={22} color={c.success} />
              <Text style={[s.body, { fontWeight: tokens.fontWeight.bold, flex: 1 }]}>Paid in full — thank you!</Text>
            </View>
            <Text style={[s.muted, { marginTop: tokens.space[1] }]}>
              Need anything else? Call or text {settings.phone || 'us'} anytime.
            </Text>
          </View>
        ) : claim ? (
          <View style={[s.card, { borderColor: c.warning }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
              <Feather name="clock" size={22} color={c.warning} />
              <Text style={[s.body, { fontWeight: tokens.fontWeight.bold, flex: 1 }]}>
                {claim.method} payment marked sent
              </Text>
            </View>
            <Text style={[s.muted, { marginTop: tokens.space[1] }]}>
              We will confirm as soon as it clears and send your receipt. Questions? {settings.phone}
            </Text>
          </View>
        ) : (
          <View style={[s.card, { borderColor: c.accent, borderWidth: 2 }]}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: c.accentSoft, borderRadius: tokens.radius.chip, paddingHorizontal: tokens.space[3], paddingVertical: tokens.space[1] }}>
              <Text style={{ color: c.accent, fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.bold }}>$0 PROCESSING FEES</Text>
            </View>
            <Text style={[sectionTitle, { marginTop: tokens.space[2] }]} accessibilityRole="header">
              Pay {settings.businessName || 'us'} directly
            </Text>
            <Text style={s.muted}>100% of your payment goes to your technician — no middleman surcharges.</Text>

            {settings.zelleHandle.trim() ? (
              <View style={{ marginTop: tokens.space[3], padding: tokens.space[3], borderWidth: 1, borderColor: c.line, borderRadius: tokens.radius.control, gap: tokens.space[2] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[s.body, { fontWeight: tokens.fontWeight.bold }]}>Option 1 · Zelle ($0 fee)</Text>
                  <Text style={{ color: c.success, fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.bold }}>INSTANT</Text>
                </View>
                <Text style={s.body}>
                  Send <Text style={{ fontWeight: tokens.fontWeight.bold }}>{money(totals.total)}</Text> in your banking app to:
                </Text>
                <Text selectable style={[s.body, { fontWeight: tokens.fontWeight.bold, color: c.accent }]}>
                  {settings.zelleHandle.trim()}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] }}>
                  <Button
                    variant="secondary"
                    icon={copiedMemo ? 'check' : 'copy'}
                    label={copiedMemo ? 'Memo copied!' : `Copy memo: ${inv.number}`}
                    onPress={() => void onCopyMemo()}
                  />
                  <Button icon="send" label="I sent my Zelle payment" onPress={onZelleSent} />
                </View>
              </View>
            ) : null}

            {settings.relayRoutingNumber.trim() && settings.relayAccountNumber.trim() ? (
              <View style={{ marginTop: tokens.space[3], padding: tokens.space[3], borderWidth: 1, borderColor: c.line, borderRadius: tokens.radius.control, gap: tokens.space[2] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[s.body, { fontWeight: tokens.fontWeight.bold }]}>Direct Relay ACH / Wire ($0 fee)</Text>
                  <Text style={{ color: c.success, fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.bold }}>COMMERCIAL & FLEETS</Text>
                </View>
                <Text style={s.muted}>
                  Send <Text style={{ fontWeight: tokens.fontWeight.bold, color: c.ink }}>{money(totals.total)}</Text> via ACH or wire to{' '}
                  <Text style={{ fontWeight: tokens.fontWeight.bold, color: c.ink }}>{settings.businessName || 'Mobile Marine Doc'}</Text>
                  {settings.relayBankName.trim() ? ` (${settings.relayBankName.trim()})` : ''}:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] }}>
                  <Button
                    variant="secondary"
                    icon={copiedRouting ? 'check' : 'copy'}
                    label={copiedRouting ? 'Routing copied!' : `Routing: ${settings.relayRoutingNumber.trim()}`}
                    onPress={() => void onCopyRouting()}
                  />
                  <Button
                    variant="secondary"
                    icon={copiedAcct ? 'check' : 'copy'}
                    label={copiedAcct ? 'Account copied!' : `Account: ${settings.relayAccountNumber.trim()}`}
                    onPress={() => void onCopyAccount()}
                  />
                  <Button
                    variant="secondary"
                    icon={copiedMemo ? 'check' : 'copy'}
                    label={copiedMemo ? 'Memo copied!' : `Memo: ${inv.number}`}
                    onPress={() => void onCopyMemo()}
                  />
                </View>
                <Button icon="send" label="I sent my ACH / wire transfer" onPress={onRelayAchSent} />
              </View>
            ) : null}

            {stripeUrl ? (
              <View style={{ marginTop: tokens.space[3], padding: tokens.space[3], borderWidth: 1, borderColor: c.line, borderRadius: tokens.radius.control, gap: tokens.space[2] }}>
                <Text style={[s.body, { fontWeight: tokens.fontWeight.bold }]}>Online Bank Checkout (Stripe ACH)</Text>
                <Text style={s.muted}>Best for larger fiberglass and refit jobs. Secure checkout via Stripe.</Text>
                <Button variant="secondary" icon="external-link" label="Pay via bank ACH" onPress={onStripe} />
              </View>
            ) : null}
          </View>
        )}

        {/* Review funnel */}
        <View style={s.card}>
          <Text style={sectionTitle} accessibilityRole="header">
            Happy with our dockside work?
          </Text>
          <Text style={s.muted}>
            Write one review below — we copy it for you so you can paste it on each site in seconds.
          </Text>

          {!reviewSubmitted ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], marginTop: tokens.space[3] }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    onPress={() => setRating(star)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  >
                    <FontAwesome name={star <= rating ? 'star' : 'star-o'} size={30} color={star <= rating ? '#E3A03A' : c.inkMuted} />
                  </Pressable>
                ))}
                <Text style={[s.muted, { marginLeft: tokens.space[2] }]}>{rating} / 5</Text>
              </View>

              <View style={{ marginTop: tokens.space[3] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.space[1] }}>
                  <Text style={s.label}>Your review</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Auto-fill review from this job"
                    onPress={() => setReviewText(draftReview(settings, inv))}
                    hitSlop={{ top: 8, bottom: 8 }}
                  >
                    <Text style={{ color: c.accent, fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.medium }}>
                      ✨ Auto-fill from this job
                    </Text>
                  </Pressable>
                </View>
                <TextInput
                  accessibilityLabel="Your review"
                  style={[s.input, { minHeight: 88, paddingTop: tokens.space[3], textAlignVertical: 'top' }]}
                  multiline
                  value={reviewText}
                  onChangeText={setReviewText}
                  placeholder="Tell other Keys boaters how your repair went…"
                  placeholderTextColor={c.inkMuted}
                />
              </View>

              <View style={{ marginTop: tokens.space[3] }}>
                <Button
                  icon={rating >= 4 ? (platforms.length > 0 ? 'copy' : 'check') : 'mail'}
                  label={
                    rating >= 4
                      ? platforms.length > 0
                        ? 'Copy review & unlock post buttons'
                        : 'Save review'
                      : 'Send private feedback to the owner'
                  }
                  disabled={!reviewText.trim()}
                  onPress={() => void onSubmitReview()}
                />
              </View>
            </>
          ) : rating <= 3 ? (
            <View style={{ marginTop: tokens.space[3], padding: tokens.space[3], backgroundColor: c.accentSoft, borderRadius: tokens.radius.control, gap: tokens.space[2] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[s.muted, { fontWeight: tokens.fontWeight.bold }]}>{rating} / 5 · Private feedback sent</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Edit feedback" onPress={() => setReviewSubmitted(false)} hitSlop={{ top: 8, bottom: 8 }}>
                  <Text style={{ color: c.accent, fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.medium }}>Edit</Text>
                </Pressable>
              </View>
              <Text style={s.body}>
                Thank you for your honest feedback. It goes straight to the owner so we can make it right — expect a call
                from {settings.phone || 'us'} soon.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: tokens.space[3], gap: tokens.space[3] }}>
              <View style={{ padding: tokens.space[3], borderWidth: 1, borderColor: c.line, borderRadius: tokens.radius.control, gap: tokens.space[2] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <FontAwesome key={star} name={star <= rating ? 'star' : 'star-o'} size={18} color={star <= rating ? '#E3A03A' : c.inkMuted} />
                    ))}
                    <Text style={[s.muted, { marginLeft: tokens.space[1] }]}>{rating} / 5</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Edit review" onPress={() => setReviewSubmitted(false)} hitSlop={{ top: 8, bottom: 8 }}>
                    <Text style={{ color: c.accent, fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.medium }}>Edit</Text>
                  </Pressable>
                </View>
                <Text style={s.body}>{reviewText}</Text>
              </View>

              {showPublicFunnel ? (
                <View style={{ padding: tokens.space[3], backgroundColor: c.accentSoft, borderRadius: tokens.radius.control, gap: tokens.space[2] }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[s.body, { fontWeight: tokens.fontWeight.bold }]}>
                      {copiedReview ? '✓ Review copied to clipboard!' : 'Ready to paste'}
                    </Text>
                    <Text style={[s.muted, { fontSize: tokens.fontSize.xs }]}>
                      Posted {posted.length} / {platforms.length}
                    </Text>
                  </View>
                  <Text style={[s.muted, { fontSize: tokens.fontSize.sm }]}>
                    Tap each site — your review is copied automatically, so just tap Paste → Post:
                  </Text>
                  {platforms.map((p) => {
                    const done = posted.includes(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Paste your review on ${p.name}`}
                        onPress={() => void onLaunchPlatform(p)}
                        style={({ pressed }) => [
                          {
                            minHeight: tokens.hit,
                            borderRadius: tokens.radius.control,
                            backgroundColor: done ? c.success : c.accent,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: tokens.space[4],
                          },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <Text style={{ color: c.accentInk, fontWeight: tokens.fontWeight.bold, fontSize: tokens.fontSize.md }}>
                          {done ? `✓ Opened ${p.name}` : `Paste on ${p.name}`}
                        </Text>
                        <Text style={{ color: c.accentInk, opacity: 0.85, fontSize: tokens.fontSize.xs }}>
                          {done ? 'Done' : p.badge}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={{ padding: tokens.space[3], backgroundColor: c.accentSoft, borderRadius: tokens.radius.control, flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
                  <Feather name="check-circle" size={20} color={c.success} />
                  <Text style={[s.body, { flex: 1 }]}>Thank you! Your review has been saved.</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <Text style={[s.muted, { textAlign: 'center', fontSize: tokens.fontSize.xs }]}>
          {[
            settings.businessName || 'Mobile Marine Doc',
            settings.licenseNo ? `Lic. ${settings.licenseNo}` : '',
            settings.phone,
            Platform.OS === 'web' ? 'mobilemarinedoc.com' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
