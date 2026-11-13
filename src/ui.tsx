import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { light, makeStyles, tokens, useColors } from './theme';

const ICON_SIZE = 20;

function useUi() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return { c, s };
}

type IconName = string;
function Icon({ name, color, size = ICON_SIZE }: { name: IconName; color: string; size?: number }) {
  return <Feather name={name as keyof typeof Feather.glyphMap} size={size} color={color} />;
}

/* ---------------------------------- Button --------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface ButtonProps {
  label?: string;
  title?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  kind?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button(props: ButtonProps) {
  const { c, s } = useUi();
  const variant: ButtonVariant = props.variant ?? props.kind ?? 'primary';
  const text =
    props.label ?? props.title ?? (typeof props.children === 'string' ? props.children : undefined) ?? '';
  const disabled = !!props.disabled;

  const variantStyle =
    variant === 'primary'
      ? s.btnPrimary
      : variant === 'secondary'
      ? s.btnSecondary
      : variant === 'danger'
      ? s.btnDanger
      : s.btnTertiary;
  const textColor =
    variant === 'primary'
      ? c.accentInk
      : variant === 'danger'
      ? light.accentInk
      : variant === 'tertiary'
      ? c.accent
      : c.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? text}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={props.onPress}
      testID={props.testID}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={({ pressed }) => [
        s.btn,
        variantStyle,
        pressed && !disabled && s.btnPressed,
        pressed && !disabled && { transform: [{ scale: 0.97 }] },
        disabled && s.btnDisabled,
        props.style,
      ]}
    >
      {props.icon ? (
        <View style={{ marginRight: text ? tokens.space[2] : 0 }}>
          <Icon name={props.icon} color={textColor} />
        </View>
      ) : null}
      {text ? (
        <Text numberOfLines={1} style={[s.btnText, { color: textColor }]}>
          {text}
        </Text>
      ) : null}
    </Pressable>
  );
}

/* -------------------------------- IconButton -------------------------------- */

export interface IconButtonProps {
  name?: IconName;
  icon?: IconName;
  label?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton(props: IconButtonProps) {
  const { c, s } = useUi();
  const name = props.name ?? props.icon ?? 'circle';
  const label = props.accessibilityLabel ?? props.label ?? name;
  const disabled = !!props.disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        s.iconBtn,
        props.active && { backgroundColor: c.accentSoft },
        pressed && !disabled && { backgroundColor: c.accentSoft, transform: [{ scale: 0.97 }] },
        disabled && s.btnDisabled,
        props.style,
      ]}
    >
      <Icon name={name} color={props.color ?? (props.active ? c.accent : c.ink)} size={22} />
    </Pressable>
  );
}

/* ----------------------------------- Card ----------------------------------- */

export function Card({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { s } = useUi();
  return <View style={[s.card, style]}>{children}</View>;
}

/* ---------------------------------- ListRow --------------------------------- */

export interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: string;
  icon?: IconName;
  leftIcon?: IconName;
  right?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
}

export function ListRow(props: ListRowProps) {
  const { c, s } = useUi();
  const leading = props.icon ?? props.leftIcon;
  const trailing = props.right ?? props.trailing;
  const showChevron = props.chevron ?? (!!props.onPress && !trailing);

  const content = (
    <>
      {leading ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: tokens.radius.control,
            backgroundColor: c.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: tokens.space[3],
          }}
        >
          <Icon name={leading} color={c.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1, flexShrink: 1 }}>
        <Text style={[s.body, { fontWeight: tokens.fontWeight.medium }, props.titleStyle]}>{props.title}</Text>
        {props.subtitle ? <Text style={[s.muted, { marginTop: 2 }]}>{props.subtitle}</Text> : null}
      </View>
      {props.value ? (
        <Text
          style={[
            s.money,
            { marginLeft: tokens.space[3], textAlign: 'right' },
            props.valueColor ? { color: props.valueColor } : null,
          ]}
        >
          {props.value}
        </Text>
      ) : null}
      {trailing ? <View style={{ marginLeft: tokens.space[3] }}>{trailing}</View> : null}
      {showChevron ? (
        <View style={{ marginLeft: tokens.space[2] }}>
          <Icon name="chevron-right" color={c.inkMuted} />
        </View>
      ) : null}
    </>
  );

  if (!props.onPress && !props.onLongPress) {
    return <View style={[s.listRow, props.style]}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        props.accessibilityLabel ?? [props.title, props.subtitle, props.value].filter(Boolean).join(', ')
      }
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      style={({ pressed }) => [s.listRow, pressed && { backgroundColor: c.accentSoft }, props.style]}
    >
      {content}
    </Pressable>
  );
}

/* ----------------------------------- Field ---------------------------------- */

export interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  helper?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Field({ label, error, helper, containerStyle, style, onFocus, onBlur, multiline, ...rest }: FieldProps) {
  const { c, s } = useUi();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ marginBottom: tokens.space[3] }, containerStyle]}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.inkMuted}
        multiline={multiline}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          s.input,
          multiline && { minHeight: 88, paddingTop: tokens.space[3], textAlignVertical: 'top' },
          focused && { borderColor: c.accent, borderWidth: 2 },
          !!error && s.inputError,
          style,
        ]}
      />
      {error ? (
        <Text style={s.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text style={[s.muted, { fontSize: tokens.fontSize.xs, marginTop: tokens.space[1] }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

/* ----------------------------------- Chip ----------------------------------- */

export interface ChipProps {
  label: string;
  active?: boolean;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function Chip(props: ChipProps) {
  const { c, s } = useUi();
  const active = !!(props.active ?? props.selected);
  const textColor = active ? c.accentInk : props.color ?? c.ink;
  const inner = (
    <>
      {props.icon ? (
        <View style={{ marginRight: tokens.space[1] }}>
          <Icon name={props.icon} color={textColor} size={16} />
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        style={{ fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.medium, color: textColor }}
      >
        {props.label}
      </Text>
    </>
  );
  const base = [s.chip, { flexDirection: 'row' as const }, active && s.chipActive, props.style];
  if (!props.onPress) {
    return <View style={base}>{inner}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ selected: active }}
      onPress={props.onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [base, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
    >
      {inner}
    </Pressable>
  );
}

/* -------------------------------- EmptyState -------------------------------- */

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  text?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState(props: EmptyStateProps) {
  const { c, s } = useUi();
  const text = props.text ?? props.message;
  return (
    <View style={s.empty}>
      <View style={s.emptyCircle}>
        <Icon name={props.icon ?? 'inbox'} color={c.accent} size={32} />
      </View>
      <Text style={s.emptyTitle} accessibilityRole="header">
        {props.title}
      </Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      {props.actionLabel && props.onAction ? (
        <View style={{ marginTop: tokens.space[2] }}>
          <Button label={props.actionLabel} onPress={props.onAction} />
        </View>
      ) : null}
      {props.secondaryLabel && props.onSecondary ? (
        <View style={{ marginTop: tokens.space[2] }}>
          <Button variant="tertiary" label={props.secondaryLabel} onPress={props.onSecondary} />
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------------- Toast ---------------------------------- */

export interface ToastProps {
  message?: string | null;
  visible?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  durationMs?: number;
  bottomOffset?: number;
}

export function Toast(props: ToastProps) {
  const { c, s } = useUi();
  const { message, onDismiss, durationMs = 4000 } = props;
  const visible = props.visible ?? !!message;
  const opacity = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(8)).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible || !message) return;
    let cancelled = false;
    opacity.setValue(0);
    rise.setValue(8);
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: tokens.motion.base, useNativeDriver: true }),
          Animated.timing(rise, { toValue: reduce ? 0 : 0, duration: reduce ? 0 : tokens.motion.base, useNativeDriver: true }),
        ]).start();
      });
    const timer = setTimeout(() => dismissRef.current?.(), durationMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, message, durationMs, opacity, rise]);

  if (!visible || !message) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[
        s.toast,
        {
          opacity,
          transform: [{ translateY: rise }],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        props.bottomOffset !== undefined ? { bottom: props.bottomOffset } : null,
      ]}
    >
      <Text style={[s.toastText, { flex: 1 }]}>{message}</Text>
      {props.actionLabel && props.onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.actionLabel}
          onPress={() => {
            props.onAction?.();
            dismissRef.current?.();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => ({
            minHeight: tokens.hit,
            justifyContent: 'center',
            paddingLeft: tokens.space[3],
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: c.accent === light.accent ? dismissAccent() : c.accent, fontWeight: tokens.fontWeight.bold, fontSize: tokens.fontSize.sm }}>
            {props.actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

// The toast sits on an "ink" background, so its action uses the dark-scheme accent for contrast in light mode.
function dismissAccent(): string {
  return '#3BB3D1';
}
