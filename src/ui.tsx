import { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R } from "./theme";
import { STAGE } from "./crm";

type BtnProps = {
  title: string;
  onPress?: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  /** Solid custom colour (e.g. WhatsApp green); text is white */
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, kind = "primary", icon, busy, disabled, small, style, color }: BtnProps) {
  const palette = color
    ? { bg: color, fg: "#fff", border: color }
    : {
        primary: { bg: C.primary, fg: "#fff", border: C.primary },
        secondary: { bg: C.surface, fg: C.navy, border: C.paleLine },
        danger: { bg: C.surface, fg: C.red, border: "#FECACA" },
        ghost: { bg: "transparent", fg: C.primary, border: "transparent" },
      }[kind];
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : icon ? (
        <Ionicons name={icon} size={small ? 15 : 17} color={palette.fg} />
      ) : null}
      <Text style={[s.btnText, small && { fontSize: 13 }, { color: palette.fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children}</Text>
      {right}
    </View>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const st = STAGE[stage] ?? { label: stage, bg: C.pale, fg: C.navy };
  return (
    <View style={[s.badge, { backgroundColor: st.bg }]}>
      <Text style={[s.badgeText, { color: st.fg }]}>{st.label}</Text>
    </View>
  );
}

export function Pill({ label, bg = C.pale, fg = C.navy }: { label: string; bg?: string; fg?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, count, tone }: { label: string; active?: boolean; onPress?: () => void; count?: number; tone?: "danger" }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.chip,
        active && { backgroundColor: C.primary, borderColor: C.primary },
        tone === "danger" && !active && { borderColor: "#FECACA" },
      ]}
    >
      <Text style={[s.chipText, active && { color: "#fff" }, tone === "danger" && !active && { color: C.red }]}>
        {label}
        {count !== undefined ? <Text style={{ color: active ? "#DCE9F5" : C.faint }}>  {count}</Text> : null}
      </Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.faint} style={[s.input, rest.multiline && { minHeight: 84, textAlignVertical: "top" }, style]} {...rest} />
    </View>
  );
}

export function Empty({ icon = "file-tray-outline", text }: { icon?: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={30} color={C.faint} />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={s.empty}>
      <ActivityIndicator color={C.primary} />
    </View>
  );
}

/** Bottom sheet for forms (move stage, log activity, follow-up...). */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  // Android draws edge-to-edge: keep the sheet's buttons above the navigation bar
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: 18 + insets.bottom }]}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={C.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 6 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const s = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: R.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btnSmall: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: R.sm },
  btnText: { fontSize: 15, fontWeight: "700" },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 8 },
  section: { fontSize: 12, fontWeight: "800", color: C.muted, letterSpacing: 1, textTransform: "uppercase" },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11.5, fontWeight: "700" },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: "700", color: C.muted },
  label: { fontSize: 13, fontWeight: "700", color: C.muted, marginBottom: 6 },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 15,
    color: C.ink,
  },
  empty: { alignItems: "center", justifyContent: "center", padding: 36, gap: 8 },
  emptyText: { color: C.muted, fontSize: 14, textAlign: "center" },
  sheetWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { backgroundColor: C.page, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: "88%" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.navy },
});
