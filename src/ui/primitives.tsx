import { userMessage } from "../security/errors";
import React, { useState, useRef } from "react";
import {
  View,
  Animated,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  AccessibilityInfo,
  findNodeHandle,
  Keyboard,
  Alert,
  Modal,
  useWindowDimensions,
  type LayoutChangeEvent,
  Platform,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  Check,
  ArrowLeft,
  Bike,
  Footprints,
  Mountain,
  TriangleAlert,
  Eye,
  EyeOff,
  X,
} from "lucide-react-native";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { brand, type, useTheme } from "./theme";
const SelectionMotionContext = React.createContext(() => {});

export function Txt({
  children,
  size = "body",
  color,
  weight = "400",
  style,
  mono = false,
  ...rest
}: {
  children?: React.ReactNode;
  size?: keyof typeof type;
  color?: string;
  weight?: TextStyle["fontWeight"];
  style?: StyleProp<TextStyle>;
  mono?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: TextProps["accessibilityRole"];
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Text
      allowFontScaling
      {...rest}
      style={[
        {
          fontSize: type[size],
          lineHeight: type[size] * 1.3,
          color: color ?? c.text,
          fontWeight: weight,
          fontVariant: mono ? ["tabular-nums"] : undefined,
          letterSpacing:
            size === "display" ? -1.5 : size === "title" ? -0.8 : 0,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Row({
  children,
  style,
  between = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  between?: boolean;
}) {
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 12 },
        between && { justifyContent: "space-between" },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Stack({
  children,
  style,
  gap = 16,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ gap }, style]}>{children}</View>;
}
export function Card({
  children,
  style,
  dark = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: dark ? brand.ink : c.surface,
          borderRadius: 14,
          padding: 16,
          borderWidth: dark ? 0 : 1,
          borderColor: c.line,
          gap: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  testID,
  style,
}: {
  title: string;
  onPress: () => void | Promise<unknown>;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, reduceMotion } = useTheme();
  const pressScale = useRef(new Animated.Value(1)).current;
  const animatePress = (toValue: number) =>
    Animated.spring(pressScale, {
      toValue: reduceMotion ? 1 : toValue,
      damping: 20,
      stiffness: 260,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const busy = loading || pending;
  const color =
    variant === "primary"
      ? brand.ink
      : variant === "danger"
        ? c.accent
        : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      testID={testID}
      disabled={disabled || busy}
      onPressIn={() => animatePress(0.96)}
      onPressOut={() => animatePress(1)}
      onPress={async () => {
        if (locked.current) return;
        locked.current = true;
        setPending(true);
        if (Platform.OS !== "web")
          void Haptics.selectionAsync().catch(() => {});
        try {
          await onPress();
        } catch (error) {
          Alert.alert("Couldn’t finish", userMessage(error));
        } finally {
          locked.current = false;
          setPending(false);
        }
      }}
      style={({ pressed }) => [
        {
          minHeight: 50,
          paddingHorizontal: 18,
          paddingVertical: 13,
          borderRadius: variant === "secondary" ? 24 : 18,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: c.line,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          backgroundColor:
            variant === "primary"
              ? c.primary
              : variant === "secondary"
                ? "transparent"
                : "transparent",
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          flexShrink: 1,
          transform: [{ scale: pressScale }],
        }}
      >
        {busy ? <ActivityIndicator color={color} /> : icon}
        <Txt
          weight="700"
          color={color}
          style={{ flexShrink: 1, textAlign: "center" }}
        >
          {title}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}
export function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { c, reduceMotion } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const press = (toValue: number) =>
    Animated.spring(scale, {
      toValue: reduceMotion ? 1 : toValue,
      damping: 20,
      stiffness: 280,
      useNativeDriver: true,
    }).start();
  return (
    <Pressable
      onPressIn={() => press(0.92)}
      onPressOut={() => press(1)}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: c.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
export function SectionHeading({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <Row between>
      <Txt size="heading" weight="700">
        {title}
      </Txt>
      {action && onPress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onPress}
          style={{
            minHeight: Platform.OS === "android" ? 48 : 44,
            justifyContent: "center",
          }}
        >
          <Row style={{ gap: 4 }}>
            <Txt size="caption" color={c.accent} weight="600">
              {action}
            </Txt>
            <ArrowUpRight size={15} color={c.accent} />
          </Row>
        </Pressable>
      )}
    </Row>
  );
}
export function Pill({
  children,
  color,
  background,
}: {
  children: React.ReactNode;
  color?: string;
  background?: string;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: background ?? c.soft,
      }}
    >
      <Txt size="micro" weight="700" color={color ?? c.muted}>
        {children}
      </Txt>
    </View>
  );
}
export function Metric({
  value,
  label,
  unit,
  color,
  small = false,
}: {
  value: string;
  label: string;
  unit?: string;
  color?: string;
  small?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Stack gap={2} style={{ flex: 1, minWidth: 85 }}>
      <Row style={{ gap: 5, alignItems: "baseline", flexWrap: "wrap" }}>
        <Txt
          mono
          size={small ? "heading" : "title"}
          weight="700"
          color={color}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ letterSpacing: -0.8, flexShrink: 1 }}
        >
          {value}
        </Txt>
        {unit && (
          <Txt size="caption" color={color ?? c.muted}>
            {unit}
          </Txt>
        )}
      </Row>
      <Txt size="caption" color={color ?? c.muted}>
        {label}
      </Txt>
    </Stack>
  );
}
export function Field({
  label,
  hideLabel = false,
  leading,
  trailing,
  containerStyle,
  style,
  onFocus,
  onBlur,
  helper,
  error,
  clearable = true,
  ...props
}: TextInputProps & {
  label: string;
  hideLabel?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  helper?: string;
  error?: string;
  clearable?: boolean;
}) {
  const { c, contrast } = useTheme();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const input = useRef<TextInput>(null);
  const editable = props.editable !== false && !props.readOnly;
  const active = focused && editable;
  const password = props.secureTextEntry === true;
  const reserveClearAction =
    clearable &&
    !password &&
    !props.multiline &&
    Boolean(props.onChangeText) &&
    !trailing &&
    editable;
  const canClear = reserveClearAction && active && Boolean(props.value?.length);
  return (
    <Stack gap={6} style={containerStyle}>
      {!hideLabel && (
        <Pressable
          accessible={false}
          onPress={() => editable && input.current?.focus()}
        >
          <Txt size="caption" weight="600" color={error ? c.accent : c.muted}>
            {label}
          </Txt>
        </Pressable>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: props.multiline ? "flex-start" : "center",
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 16,
          borderRadius: 12,
          backgroundColor: c.soft,
          borderWidth: 1,
          borderColor:
            error || active ? c.accent : contrast ? c.muted : "transparent",
          opacity: editable ? 1 : 0.65,
        }}
      >
        {leading}
        <TextInput
          {...props}
          ref={input}
          secureTextEntry={password && !passwordVisible}
          clearButtonMode="never"
          accessibilityLabel={props.accessibilityLabel ?? label}
          accessibilityState={{
            ...props.accessibilityState,
            disabled: !editable,
          }}
          placeholderTextColor={props.placeholderTextColor ?? c.muted}
          selectionColor={props.selectionColor ?? c.accent}
          cursorColor={props.cursorColor ?? c.accent}
          underlineColorAndroid="transparent"
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            {
              flex: 1,
              minWidth: 0,
              minHeight: props.multiline ? 108 : 50,
              paddingVertical: 12,
              paddingHorizontal: 0,
              fontSize: type.body,
              color: editable ? c.text : c.muted,
              textAlignVertical: props.multiline ? "top" : "center",
            },
            style,
          ]}
        />
        {trailing}
        {!trailing && password && editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible ? "Hide password" : "Show password"
            }
            accessibilityState={{ checked: passwordVisible }}
            onPress={() => setPasswordVisible((visible) => !visible)}
            hitSlop={4}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              marginRight: -10,
            }}
          >
            {passwordVisible ? (
              <EyeOff size={20} color={c.muted} />
            ) : (
              <Eye size={20} color={c.muted} />
            )}
          </Pressable>
        ) : canClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            onPress={() => {
              props.onChangeText?.("");
              input.current?.focus();
            }}
            hitSlop={4}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              marginRight: -10,
            }}
          >
            <X size={18} color={c.muted} />
          </Pressable>
        ) : reserveClearAction ? (
          <View
            pointerEvents="none"
            accessible={false}
            style={{ width: 44, height: 44, marginRight: -10 }}
          />
        ) : null}
      </View>
      {error ? (
        <Txt size="caption" color={c.accent} accessibilityRole="alert">
          {error}
        </Txt>
      ) : helper ? (
        <Txt size="caption" color={c.muted}>
          {helper}
        </Txt>
      ) : null}
    </Stack>
  );
}
export function Notice({ text, retry }: { text: string; retry?: () => void }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{ padding: 16, borderRadius: 12, backgroundColor: c.soft, gap: 8 }}
    >
      <Row style={{ alignItems: "flex-start" }}>
        <TriangleAlert size={18} color={c.accent} />
        <Txt style={{ flex: 1 }}>{text}</Txt>
      </Row>
      {retry && <Button variant="quiet" title="Try again" onPress={retry} />}
    </View>
  );
}
export function Screen({
  children,
  title,
  eyebrow,
  subtitle,
  action,
  back = false,
  scroll = true,
  contentStyle,
}: {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  action?: React.ReactNode;
  back?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { c, reduceMotion } = useTheme(),
    { width } = useWindowDimensions();
  const switchOffset = useRef(new Animated.Value(0)).current;
  const switchMotion = React.useCallback(() => {
    if (reduceMotion || Keyboard.isVisible()) return;
    switchOffset.stopAnimation();
    switchOffset.setValue(4);
    Animated.spring(switchOffset, {
      toValue: 0,
      damping: 24,
      stiffness: 280,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, switchOffset]);
  const body = (
    <Animated.View
      style={[
        {
          width: "100%",
          maxWidth: 1120,
          alignSelf: "center",
          paddingHorizontal: width > 760 ? 36 : 16,
          paddingTop: Platform.OS === "web" ? 36 : 12,
          paddingBottom: back ? 32 : 120,
          gap: 20,
        },
        contentStyle,
        { transform: [{ translateY: switchOffset }] },
      ]}
    >
      {(title || eyebrow) && (
        <Stack gap={10}>
          <Row between style={{ alignItems: "center", minHeight: 44 }}>
            {back && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace("/")
                }
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: -10,
                }}
              >
                <ArrowLeft size={24} color={c.text} />
              </Pressable>
            )}
            <Stack gap={5} style={{ flex: 1 }}>
              {title && (
                <Txt
                  accessibilityRole="header"
                  accessibilityLabel={title}
                  size="heading"
                  weight="700"
                >
                  {title}
                </Txt>
              )}
            </Stack>
            {action}
          </Row>
          {subtitle && <Txt color={c.muted}>{subtitle}</Txt>}
        </Stack>
      )}
      {children}
    </Animated.View>
  );
  return (
    <SelectionMotionContext.Provider value={switchMotion}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: c.bg }}
        edges={["top", "left", "right"]}
        testID="screen"
      >
        {scroll ? (
          <ScrollView
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </SafeAreaView>
    </SelectionMotionContext.Provider>
  );
}
export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.line }} />;
}
export function ListRow({
  title,
  detail,
  icon,
  onPress,
  tail,
}: {
  title: string;
  detail?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  tail?: React.ReactNode;
}) {
  const { c, reduceMotion } = useTheme();
  const offset = useRef(new Animated.Value(0)).current;
  const press = (toValue: number) =>
    Animated.spring(offset, {
      toValue: reduceMotion ? 0 : toValue,
      damping: 22,
      stiffness: 280,
      useNativeDriver: true,
    }).start();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      onPressIn={() => onPress && press(3)}
      onPressOut={() => press(0)}
      style={{
        minHeight: 64,
        paddingVertical: 12,
        flexDirection: "row",
        gap: 14,
        alignItems: "center",
      }}
    >
      <Animated.View
        style={{
          flexDirection: "row",
          gap: 14,
          alignItems: "center",
          flex: 1,
          transform: [{ translateX: offset }],
        }}
      >
        {icon}
        <Stack gap={3} style={{ flex: 1 }}>
          <Txt weight="600">{title}</Txt>
          {detail && (
            <Txt size="caption" color={c.muted}>
              {detail}
            </Txt>
          )}
        </Stack>
        {tail ?? (onPress ? <ChevronRight size={18} color={c.muted} /> : null)}
      </Animated.View>
    </Pressable>
  );
}
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const switchMotion = React.useContext(SelectionMotionContext);
  const [open, setOpen] = useState(false);
  const focused = useIsFocused();
  const pending = useRef<T | null>(null);
  const presented = useRef(false);
  const closing = useRef(false);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const trigger = useRef<View>(null);
  const cancel = useRef<View>(null);
  const list = useRef<ScrollView>(null);
  const { height } = useWindowDimensions();
  const { c, reduceMotion } = useTheme();
  const selected = options.find((option) => option.value === value)?.label;
  const disabled = options.length === 0;
  const dismiss = React.useCallback(() => {
    if (presented.current) closing.current = true;
    setOpen(false);
  }, []);
  const finishDismiss = React.useCallback(() => {
    presented.current = false;
    closing.current = false;
    const next = pending.current;
    pending.current = null;
    if (!focusedRef.current) return;
    if (next !== null) {
      changeRef.current(next);
      switchMotion();
    } else if (Platform.OS === "web") trigger.current?.focus();
    else {
      const handle = findNodeHandle(trigger.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, [switchMotion]);
  React.useEffect(() => {
    focusedRef.current = true;
    return () => {
      focusedRef.current = false;
      pending.current = null;
    };
  }, []);
  React.useEffect(() => {
    focusedRef.current = focused;
    if (!focused) {
      pending.current = null;
      dismiss();
    }
  }, [focused, dismiss]);
  React.useEffect(() => {
    // Android does not emit onDismiss. With no exit animation, commit the
    // selection on the next frame after React removes the dialog.
    if (Platform.OS === "ios" || open || !closing.current) return;
    const frame = requestAnimationFrame(finishDismiss);
    return () => cancelAnimationFrame(frame);
  }, [open, finishDismiss]);
  React.useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      trigger.current?.focus();
    };
  }, [open, dismiss]);
  React.useEffect(() => {
    if (disabled) {
      pending.current = null;
      dismiss();
    }
  }, [disabled, dismiss]);
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ?? (disabled ? "No options available" : "Choose")}`}
        accessibilityHint="Opens a list of choices"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => {
          if (closing.current || presented.current || !focusedRef.current)
            return;
          Keyboard.dismiss();
          presented.current = true;
          setOpen(true);
        }}
        style={({ pressed }) => ({
          minHeight: 56,
          maxWidth: "100%",
          minWidth: 0,
          flexShrink: 1,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: open ? c.accent : c.line,
          backgroundColor: c.soft,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        })}
      >
        <Stack gap={1} style={{ minWidth: 0, flexShrink: 1 }}>
          <Txt size="caption" color={c.muted}>
            {label}
          </Txt>
          <Txt color={selected ? c.text : c.muted} style={{ flexShrink: 1 }}>
            {selected ?? (disabled ? "No options available" : "Choose")}
          </Txt>
        </Stack>
        <ChevronDown size={18} color={c.muted} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType={Platform.OS !== "ios" || reduceMotion ? "none" : "fade"}
        onRequestClose={dismiss}
        onShow={() => {
          if (Platform.OS === "web") cancel.current?.focus();
          else {
            const handle = findNodeHandle(cancel.current);
            if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
          }
        }}
        onDismiss={finishDismiss}
      >
        <View
          accessibilityViewIsModal
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            onPress={dismiss}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: brand.ink, opacity: 0.48 },
            ]}
          />
          <SafeAreaView
            edges={["bottom", "left", "right"]}
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: height * 0.72,
              alignSelf: "center",
              backgroundColor: c.surface,
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              paddingBottom: 8,
            }}
          >
            <Row
              between
              style={{ paddingHorizontal: 20, minHeight: 60, gap: 12 }}
            >
              <Txt
                accessibilityRole="header"
                size="subheading"
                weight="600"
                style={{ flex: 1 }}
              >
                {label}
              </Txt>
              <Pressable
                ref={cancel}
                accessibilityRole="button"
                accessibilityLabel={`Cancel ${label}`}
                onPress={dismiss}
                style={({ pressed }) => ({
                  minHeight: 48,
                  paddingHorizontal: 8,
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Txt color={c.accent}>Cancel</Txt>
              </Pressable>
            </Row>
            <ScrollView
              ref={list}
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: active }}
                    onLayout={({ nativeEvent: { layout } }) => {
                      if (active)
                        list.current?.scrollTo({
                          y: Math.max(0, layout.y - 52),
                          animated: false,
                        });
                    }}
                    onPress={() => {
                      if (closing.current) return;
                      pending.current = active ? null : option.value;
                      dismiss();
                    }}
                    style={({ pressed }) => ({
                      minHeight: 52,
                      paddingVertical: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      borderTopWidth: 1,
                      borderTopColor: c.line,
                      backgroundColor: pressed ? c.soft : c.surface,
                    })}
                  >
                    <Txt style={{ flex: 1 }}>{option.label}</Txt>
                    {active ? (
                      <Check size={20} color={c.accent} />
                    ) : (
                      <View style={{ width: 20 }} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
function SelectorOption({
  label,
  value,
  selected,
  onPress,
  onLayout,
  compact,
}: {
  label: string;
  value: string;
  selected: boolean;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  compact: boolean;
}) {
  const { c, reduceMotion } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const press = (toValue: number) =>
    Animated.spring(scale, {
      toValue: reduceMotion ? 1 : toValue,
      damping: 20,
      stiffness: 280,
      useNativeDriver: true,
    }).start();
  const Icon =
    value === "ride"
      ? Bike
      : value === "hike"
        ? Mountain
        : value === "run" || value === "walk"
          ? Footprints
          : undefined;
  const color = selected ? brand.ink : c.muted;
  return (
    <Pressable
      onLayout={onLayout}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={() => press(0.95)}
      onPressOut={() => press(1)}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: Icon ? 14 : compact ? 11 : 18,
        paddingVertical: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Animated.View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          transform: [{ scale }],
        }}
      >
        {Icon && <Icon size={17} color={color} />}
        <Txt size="caption" weight="600" color={color}>
          {label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const { c, reduceMotion } = useTheme();
  const switchMotion = React.useContext(SelectionMotionContext);
  const [rects, setRects] = useState<
    Record<string, { x: number; width: number; height: number }>
  >({});
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const [viewport, setViewport] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const initialized = useRef(false);
  const selected = rects[value];
  React.useEffect(() => {
    if (!selected) return;
    if (viewport) {
      const nextOffset =
        selected.x < offset.current
          ? selected.x
          : selected.x + selected.width > offset.current + viewport
            ? selected.x + selected.width - viewport
            : offset.current;
      if (nextOffset !== offset.current) {
        scroll.current?.scrollTo({ x: nextOffset, animated: !reduceMotion });
        offset.current = nextOffset;
      }
    }
    x.stopAnimation();
    width.stopAnimation();
    if (!initialized.current || reduceMotion) {
      x.setValue(selected.x);
      width.setValue(selected.width);
      initialized.current = true;
      return;
    }
    // Animate measured geometry rather than scaleX so longer labels retain
    // the same round ends instead of stretching the pill's corner radius.
    const animation = Animated.parallel([
      Animated.spring(x, {
        toValue: selected.x,
        damping: 26,
        stiffness: 280,
        mass: 0.7,
        useNativeDriver: false,
      }),
      Animated.spring(width, {
        toValue: selected.width,
        damping: 26,
        stiffness: 280,
        mass: 0.7,
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [selected?.x, selected?.width, viewport, reduceMotion, x, width]);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      keyboardShouldPersistTaps="handled"
      bounces={false}
      showsHorizontalScrollIndicator={false}
      onLayout={({ nativeEvent: { layout } }) => setViewport(layout.width)}
      onScroll={({ nativeEvent }) => {
        offset.current = nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={16}
    >
      <Row style={{ gap: compact ? 6 : 8, position: "relative" }}>
        {!!selected && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: x,
              top: 0,
              width,
              height: selected.height,
              borderRadius: 24,
              backgroundColor: c.primary,
            }}
          />
        )}
        {options.map((option) => (
          <SelectorOption
            key={option.value}
            compact={compact}
            label={option.label}
            value={option.value}
            selected={option.value === value && !!selected}
            onPress={() => {
              if (option.value !== value) {
                if (Platform.OS !== "web")
                  void Haptics.selectionAsync().catch(() => {});
                onChange(option.value);
                switchMotion();
              }
            }}
            onLayout={({ nativeEvent: { layout } }) =>
              setRects((previous) => {
                const old = previous[option.value];
                if (
                  old?.x === layout.x &&
                  old.width === layout.width &&
                  old.height === layout.height
                )
                  return previous;
                return {
                  ...previous,
                  [option.value]: {
                    x: layout.x,
                    width: layout.width,
                    height: layout.height,
                  },
                };
              })
            }
          />
        ))}
      </Row>
    </ScrollView>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Stack gap={12} style={{ paddingVertical: 30 }}>
      <Txt size="heading" weight="700">
        {title}
      </Txt>
      <Txt color={c.muted} style={{ maxWidth: 420 }}>
        {body}
      </Txt>
      {action}
    </Stack>
  );
}
