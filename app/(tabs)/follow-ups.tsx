import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../../src/api";
import { fmtDateTime, stageLabel } from "../../src/crm";
import { Button, Card, Chip, Empty, Loading } from "../../src/ui";
import { C } from "../../src/theme";

const WHEN: [string, string][] = [
  ["today", "Today"],
  ["overdue", "Overdue"],
  ["upcoming", "Upcoming"],
];

export default function FollowUps() {
  const router = useRouter();
  const [when, setWhen] = useState("today");
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api("/crm/follow-ups", { query: { when } }));
    } catch (e: any) {
      Alert.alert("Could not load follow-ups", e.message);
      setRows([]);
    }
  }, [when]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const close = async (id: number, status: "done" | "missed") => {
    setBusy(id);
    try {
      await api(`/crm/follow-ups/${id}`, { method: "PATCH", body: { status } });
      setRows((r) => (r ?? []).filter((f) => f.id !== id));
    } catch (e: any) {
      Alert.alert("Could not update", e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", gap: 8, padding: 14, paddingBottom: 4 }}>
        {WHEN.map(([k, l]) => (
          <Chip key={k} label={l} active={when === k} tone={k === "overdue" ? "danger" : undefined} onPress={() => { setRows(null); setWhen(k); }} />
        ))}
      </View>
      {rows === null ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(f) => String(f.id)}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<Empty icon="calendar-clear-outline" text={`No ${when} follow-ups.`} />}
          renderItem={({ item: f }) => (
            <Card style={when === "overdue" ? { borderColor: "#FECACA" } : undefined}>
              <Pressable onPress={() => router.push(`/lead/${f.lead_id}`)}>
                <View style={st.row}>
                  <Text style={st.name} numberOfLines={1}>{f.lead_name}</Text>
                  <Text style={[st.when, when === "overdue" && { color: C.red }]}>{fmtDateTime(f.due_at)}</Text>
                </View>
                <Text style={st.meta}>
                  {f.type} · {stageLabel(f.stage)}
                  {f.phone ? ` · ${f.phone}` : ""}
                </Text>
                {f.note ? <Text style={st.note}>{f.note}</Text> : null}
              </Pressable>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button small title="Done" icon="checkmark" onPress={() => close(f.id, "done")} busy={busy === f.id} style={{ flex: 1 }} />
                <Button small kind="secondary" title="Missed" onPress={() => close(f.id, "missed")} disabled={busy === f.id} style={{ flex: 1 }} />
                <Button small kind="secondary" title="Open" icon="open-outline" onPress={() => router.push(`/lead/${f.lead_id}`)} style={{ flex: 1 }} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: C.ink },
  when: { fontSize: 13, fontWeight: "700", color: C.primary },
  meta: { color: C.muted, marginTop: 3, textTransform: "capitalize" },
  note: { color: C.ink, marginTop: 6 },
});
