import { useCallback, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { STAGE, ago, fmtDateTime, stageLabel } from "../../src/crm";
import { whatsappNumberOf } from "../../src/messages";
import { Card, Empty, Loading, SectionTitle } from "../../src/ui";
import { C } from "../../src/theme";

type QueueLead = { id: number; name: string; phone?: string; whatsapp_number?: string; stage: string; source?: string; created_at: string; is_new?: boolean; last_discussion_at?: string | null };
// Stages shown on the pipeline bar (working stages, in tab order)
const PIPE = ["new", "attempting_contact", "in_conversation", "application", "exam_scheduled", "no_response", "on_hold"];

type FollowUp = { id: number; lead_id: number; due_at: string; type: string; note?: string; lead_name: string; stage: string; course_title?: string };

export default function Today() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [fresh, setFresh] = useState<QueueLead[]>([]);
  const [quiet, setQuiet] = useState<QueueLead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const coordinator = user?.role === "exam_coordinator";

  const load = useCallback(async () => {
    try {
      setData(await api("/crm/dashboard"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
    if (!coordinator) {
      // Work queue: new leads to call (unopened first), then open leads that have gone quiet
      api<any>("/crm/leads", { query: { stage: "new", limit: 10 } })
        .then((d) => {
          setCounts(d.counts ?? {});
          setFresh([...(d.leads ?? [])].sort((a: QueueLead, b: QueueLead) => Number(!!b.is_new) - Number(!!a.is_new)).slice(0, 5));
        })
        .catch(() => {});
      api<any>("/crm/leads", { query: { contact: "quiet", sort: "quiet_first", limit: 15 } })
        .then((d) => setQuiet((d.leads ?? []).filter((l: QueueLead) => l.stage !== "new").slice(0, 5)))
        .catch(() => {});
    }
    api("/notifications")
      .then((d) => setUnread(d.unread ?? 0))
      .catch(() => {});
  }, [coordinator]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const k = data?.kpis ?? {};
  const ex = data?.exams ?? {};
  // [label, number, colour, stage to open (undefined = follow-ups), payment-due filter]
  const tiles: [string, number, string?, string?, boolean?][] = coordinator
    ? [
        ["Applications", k.applications, undefined, "application"],
        ["Exam scheduled", k.exam_scheduled, undefined, "exam_scheduled"],
        ["Exams in 7 days", ex.next_7_days, C.primary, "exam_scheduled"],
        ["Payment due", ex.payment_alerts, C.red, "exam_scheduled", true],
        ["Course Done", k.course_done, C.green, "course_done"],
        ["Paid this month", ex.payments_this_month, C.green, "course_done"],
      ]
    : [
        ["Open", k.open_leads, undefined, ""],
        ["New", k.new_leads, C.primary, "new"],
        ["Due", (k.follow_ups_today ?? 0) + (k.overdue_follow_ups ?? 0), (k.overdue_follow_ups ?? 0) > 0 ? C.red : C.primary],
        ["Backlog", k.backlog, undefined, "backlog"],
      ];
  const first = user?.name?.split(" ")[0] ?? "";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
  const toCall = k.new_leads ?? 0;
  const nothingDue = !(data?.overdue?.length || data?.today?.length);
  const openLead = (id: number) => router.push(`/lead/${id}`);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={st.hello}>Hi {first} 👋</Text>
          <Text style={st.sub}>
            {coordinator ? "Your students’ applications, exams and payments." : `${today}${toCall ? ` · ${toCall} new to call` : ""}`}
          </Text>
        </View>
        <Pressable onPress={() => router.push("/notifications")} style={st.bell} accessibilityLabel={`Notifications, ${unread} unread`}>
          <Ionicons name="notifications-outline" size={22} color={C.navy} />
          {unread > 0 ? (
            <View style={st.badge}>
              <Text style={st.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {error ? <Text style={st.error}>{error}</Text> : null}
      {!data && !error ? (
        <Loading />
      ) : data ? (
        <>
          <View style={st.grid}>
            {tiles.map(([label, n, color, stage, alert]) => (
              <Pressable
                key={label}
                style={coordinator ? st.tile : st.chip}
                onPress={() =>
                  stage !== undefined
                    ? router.push({ pathname: "/leads", params: { stage, alert: alert ? "1" : "" } })
                    : router.push("/follow-ups")
                }
              >
                <Text style={[coordinator ? st.tileNum : st.chipNum, n > 0 && color ? { color } : null]}>{n ?? 0}</Text>
                <Text style={st.tileLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {data.exams?.payment_alerts > 0 && (
            <Pressable onPress={() => router.push({ pathname: "/leads", params: { stage: "exam_scheduled", alert: "1" } })} style={st.alert}>
              <Ionicons name="alert-circle" size={18} color={C.red} />
              <Text style={st.alertText}>{data.exams.payment_alerts} exam done, payment due</Text>
            </Pressable>
          )}

          {coordinator ? (
            <UpcomingExams items={ex.upcoming ?? []} onOpen={openLead} />
          ) : (
            <>
              <Pipeline counts={counts} onOpen={(stage) => router.push({ pathname: "/leads", params: { stage } })} />
              {nothingDue ? (
                <View style={st.caughtUp}>
                  <Ionicons name="checkmark-circle" size={18} color={C.green} />
                  <Text style={st.caughtUpText}>No follow-ups due. Here’s what to work on next.</Text>
                </View>
              ) : (
                <>
                  {data.overdue?.length ? <FollowUpList title="Overdue" items={data.overdue} danger onOpen={openLead} /> : null}
                  {data.today?.length ? <FollowUpList title="Due today" items={data.today} onOpen={openLead} /> : null}
                </>
              )}
              <Queue
                title="Call first · new leads"
                items={fresh}
                empty="No new leads waiting. Nice work."
                meta={(l) => `${l.source ? `${l.source[0].toUpperCase()}${l.source.slice(1)} · ` : ""}added ${ago(l.created_at)}`}
                onOpen={openLead}
                more={(k.new_leads ?? 0) > fresh.length ? () => router.push({ pathname: "/leads", params: { stage: "new" } }) : undefined}
              />
              <Queue
                title="Going quiet · no talk in 7 days"
                items={quiet}
                empty="Everyone you’re working with has heard from you this week."
                warn
                meta={(l) => `${stageLabel(l.stage)} · ${l.last_discussion_at ? `last talk ${ago(l.last_discussion_at)}` : "not contacted yet"}`}
                onOpen={openLead}
              />
            </>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function UpcomingExams({ items, onOpen }: { items: any[]; onOpen: (id: number) => void }) {
  return (
    <>
      <SectionTitle>Upcoming exams ({items.length})</SectionTitle>
      {!items.length ? (
        <Card>
          <Empty icon="calendar-clear-outline" text="No exams scheduled." />
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((e) => (
            <Pressable key={e.id} onPress={() => onOpen(e.id)}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={st.name} numberOfLines={1}>{e.name}</Text>
                  <Text style={st.when}>{e.exam_scheduled_at ? fmtDateTime(e.exam_scheduled_at) : "No date"}</Text>
                </View>
                <Text style={[st.meta, { textTransform: "none" }]}>
                  {e.course_title || "No course"}
                  {e.owner_name ? ` · Consultant: ${e.owner_name}` : ""}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

/** One thin bar: how this consultant's working leads are spread across stages. */
function Pipeline({ counts, onOpen }: { counts: Record<string, number>; onOpen: (stage: string) => void }) {
  const parts = PIPE.map((k) => [k, counts[k] ?? 0] as const).filter(([, n]) => n > 0);
  if (!parts.length) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={st.pipeTitle}>Your pipeline</Text>
      <View style={st.pipeBar}>
        {parts.map(([k, n]) => (
          <View key={k} style={{ flex: n, backgroundColor: STAGE[k]?.fg ?? C.primary }} />
        ))}
      </View>
      <View style={st.pipeLegend}>
        {parts.map(([k, n]) => (
          <Pressable key={k} onPress={() => onOpen(k)} style={st.pipeItem} hitSlop={6}>
            <View style={[st.pipeDot, { backgroundColor: STAGE[k]?.fg ?? C.primary }]} />
            <Text style={st.pipeText}>
              {stageLabel(k)} {n}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** A short list of leads to act on, with one-tap Call and WhatsApp. */
function Queue({ title, items, empty, meta, onOpen, more, warn }: { title: string; items: QueueLead[]; empty: string; meta: (l: QueueLead) => string; onOpen: (id: number) => void; more?: () => void; warn?: boolean }) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <View style={st.list}>
        {!items.length ? (
          <Text style={st.listEmpty}>{empty}</Text>
        ) : (
          items.map((l, i) => {
            const wa = whatsappNumberOf(l);
            return (
              <View key={l.id} style={[st.row, i > 0 && st.rowLine]}>
                <Pressable onPress={() => onOpen(l.id)} style={st.rowMain} accessibilityRole="button" accessibilityLabel={`Open ${l.name}`}>
                  <View style={[st.dot, { backgroundColor: l.is_new ? C.red : "transparent" }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.rowName} numberOfLines={1}>{l.name}</Text>
                    <Text style={[st.rowMeta, warn && { color: "#B45309" }]} numberOfLines={1}>{meta(l)}</Text>
                  </View>
                </Pressable>
                {l.phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${l.phone}`)} style={[st.act, { backgroundColor: C.pale }]} accessibilityLabel={`Call ${l.name}`} hitSlop={4}>
                    <Ionicons name="call" size={17} color={C.primary} />
                  </Pressable>
                ) : null}
                {wa ? (
                  <Pressable onPress={() => Linking.openURL(`https://wa.me/${wa}`)} style={[st.act, { backgroundColor: C.greenSoft }]} accessibilityLabel={`WhatsApp ${l.name}`} hitSlop={4}>
                    <Ionicons name="logo-whatsapp" size={18} color="#0F7A42" />
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
        {more ? (
          <Pressable onPress={more} style={[st.row, st.rowLine]}>
            <Text style={st.more}>See all</Text>
            <Ionicons name="chevron-forward" size={15} color={C.primary} />
          </Pressable>
        ) : null}
      </View>
    </>
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
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: C.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  hello: { fontSize: 24, fontWeight: "800", color: C.navy },
  sub: { color: C.muted, marginBottom: 12 },
  error: { color: C.red, marginVertical: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "31%", flexGrow: 1, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12 },
  tileNum: { fontSize: 24, fontWeight: "800", color: C.navy },
  tileLabel: { color: C.muted, fontSize: 12, marginTop: 2 },
  chip: { flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingVertical: 8, paddingHorizontal: 10 },
  chipNum: { fontSize: 19, fontWeight: "800", color: C.navy },
  pipeTitle: { color: C.muted, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  pipeBar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 },
  pipeLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 7 },
  pipeItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  pipeDot: { width: 7, height: 7, borderRadius: 4 },
  pipeText: { color: C.muted, fontSize: 12 },
  caughtUp: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: C.greenSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 16 },
  caughtUpText: { color: C.green, fontWeight: "600", flex: 1 },
  list: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  listEmpty: { color: C.muted, padding: 14, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: C.line },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowName: { fontSize: 15, fontWeight: "700", color: C.ink },
  rowMeta: { fontSize: 12, color: C.muted, marginTop: 1 },
  act: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  more: { flex: 1, color: C.primary, fontWeight: "700", fontSize: 13 },
  alert: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: C.redSoft, borderColor: "#FECACA", borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  alertText: { color: C.red, fontWeight: "700" },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: C.ink },
  when: { fontSize: 13, fontWeight: "700", color: C.primary },
  meta: { color: C.muted, fontSize: 13, marginTop: 3, textTransform: "capitalize" },
  note: { color: C.ink, fontSize: 13, marginTop: 6 },
});
