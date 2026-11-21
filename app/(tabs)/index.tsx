import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { fmtDateTime, stageLabel } from "../../src/crm";
import { Card, Empty, Loading, SectionTitle } from "../../src/ui";
import { C } from "../../src/theme";

type FollowUp = { id: number; lead_id: number; due_at: string; type: string; note?: string; lead_name: string; stage: string; course_title?: string };

export default function Today() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/crm/dashboard"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const k = data?.kpis ?? {};
  const tiles: [string, number, string?, string?][] = [
    ["Open leads", k.open_leads, undefined, ""],
    ["Due today", k.follow_ups_today, C.primary],
    ["Overdue", k.overdue_follow_ups, C.red],
    ["Applications", k.applications, undefined, "application"],
    ["Exam scheduled", k.exam_scheduled, undefined, "exam_scheduled"],
    ["Course Done", k.course_done, C.green, "course_done"],
  ];
  const first = user?.name?.split(" ")[0] ?? "";

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={st.hello}>Hi {first} 👋</Text>
      <Text style={st.sub}>Here’s your day.</Text>
      {error ? <Text style={st.error}>{error}</Text> : null}
      {!data && !error ? (
        <Loading />
      ) : data ? (
        <>
          <View style={st.grid}>
            {tiles.map(([label, n, color, stage]) => (
              <Pressable
                key={label}
                style={st.tile}
                onPress={() => (stage !== undefined ? router.push({ pathname: "/leads", params: { stage } }) : router.push("/follow-ups"))}
              >
                <Text style={[st.tileNum, n > 0 && color ? { color } : null]}>{n ?? 0}</Text>
                <Text style={st.tileLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {data.exams?.payment_alerts > 0 && (
            <Pressable onPress={() => router.push({ pathname: "/leads", params: { stage: "exam_scheduled" } })} style={st.alert}>
              <Ionicons name="alert-circle" size={18} color={C.red} />
              <Text style={st.alertText}>{data.exams.payment_alerts} exam done, payment due</Text>
            </Pressable>
          )}

          <FollowUpList title="Overdue" items={data.overdue} danger onOpen={(id) => router.push(`/lead/${id}`)} />
          <FollowUpList title="Due today" items={data.today} onOpen={(id) => router.push(`/lead/${id}`)} />
        </>
      ) : null}
    </ScrollView>
  );
}

function FollowUpList({ title, items, danger, onOpen }: { title: string; items: FollowUp[]; danger?: boolean; onOpen: (id: number) => void }) {
  return (
    <>
      <SectionTitle>
        {title} ({items?.length ?? 0})
      </SectionTitle>
      {!items?.length ? (
        <Card>
          <Empty icon="checkmark-done-outline" text={danger ? "Nothing overdue." : "No follow-ups due today."} />
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((f) => (
            <Pressable key={f.id} onPress={() => onOpen(f.lead_id)}>
              <Card style={danger ? { borderColor: "#FECACA" } : undefined}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={st.name} numberOfLines={1}>{f.lead_name}</Text>
                  <Text style={[st.when, danger && { color: C.red }]}>{fmtDateTime(f.due_at)}</Text>
                </View>
                <Text style={st.meta}>
                  {f.type} · {stageLabel(f.stage)}
                  {f.course_title ? ` · ${f.course_title}` : ""}
                </Text>
                {f.note ? <Text style={st.note} numberOfLines={2}>{f.note}</Text> : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

const st = StyleSheet.create({
  hello: { fontSize: 24, fontWeight: "800", color: C.navy },
  sub: { color: C.muted, marginBottom: 12 },
  error: { color: C.red, marginVertical: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "31%", flexGrow: 1, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12 },
  tileNum: { fontSize: 24, fontWeight: "800", color: C.navy },
  tileLabel: { color: C.muted, fontSize: 12, marginTop: 2 },
  alert: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: C.redSoft, borderColor: "#FECACA", borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  alertText: { color: C.red, fontWeight: "700" },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: C.ink },
  when: { fontSize: 13, fontWeight: "700", color: C.primary },
  meta: { color: C.muted, fontSize: 13, marginTop: 3, textTransform: "capitalize" },
  note: { color: C.ink, fontSize: 13, marginTop: 6 },
});
