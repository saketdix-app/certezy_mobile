import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../src/api";
import { ago } from "../src/crm";
import { Button, Empty, Loading } from "../src/ui";
import { C } from "../src/theme";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  lead_assigned: "person-add-outline",
  exam_assigned: "school-outline",
  follow_up_due: "alarm-outline",
  payment_due: "cash-outline",
  exam_schedule: "calendar-outline",
  exam_completed: "checkmark-done-outline",
};
const leadOf = (link?: string | null) => {
  const m = /[?&]lead=(\d+)/.exec(String(link ?? ""));
  return m ? Number(m[1]) : null;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      const d = await api("/notifications");
      setItems(d.items ?? []);
    } catch {
      setItems([]);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = async (n: any) => {
    if (!n.read_at) api(`/notifications/read`, { method: "PUT", query: { id: n.id } }).catch(() => {});
    setItems((list) => (list ?? []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    const id = leadOf(n.link);
    if (id) router.push(`/lead/${id}`);
  };

  if (!items) return <Loading />;
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <FlatList
      data={items}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 24 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        unread ? (
          <Button
            small
            kind="ghost"
            title={`Mark all ${unread} as read`}
            style={{ alignSelf: "flex-end" }}
            onPress={async () => {
              await api("/notifications/read", { method: "PUT" }).catch(() => {});
              setItems((list) => (list ?? []).map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
            }}
          />
        ) : null
      }
      ListEmptyComponent={<Empty icon="notifications-off-outline" text="No notifications yet." />}
      renderItem={({ item: n }) => (
        <Pressable onPress={() => open(n)} style={[st.row, !n.read_at && st.unread]}>
          <View style={st.icon}>
            <Ionicons name={ICON[n.type] ?? "notifications-outline"} size={18} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.title, !n.read_at && { fontWeight: "800" }]}>{n.title}</Text>
            {n.body ? <Text style={st.body}>{n.body}</Text> : null}
            <Text style={st.time}>{ago(n.created_at)}</Text>
          </View>
          {!n.read_at ? <View style={st.dot} /> : null}
        </Pressable>
      )}
    />
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12 },
  unread: { borderColor: C.paleLine, backgroundColor: "#F7FBFF" },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.pale, alignItems: "center", justifyContent: "center" },
  title: { color: C.ink, fontSize: 15, fontWeight: "600" },
  body: { color: C.muted, marginTop: 2 },
  time: { color: C.faint, fontSize: 12, marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary, marginTop: 6 },
});
