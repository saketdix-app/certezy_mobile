import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { STAGES, ago, fmtDateTime, isOverdue } from "../../src/crm";
import { Card, Chip, Empty, Loading, StageBadge } from "../../src/ui";
import { C } from "../../src/theme";
import { pickDateTime } from "../../src/pickDateTime";

// Lead added: quick ranges, or Custom (two dates, read as IST days by the server)
const RANGES: [string, string][] = [
  ["", "Any time"],
  ["1d", "1 day"],
  ["3d", "3 days"],
  ["7d", "1 week"],
];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const short = (s: string) => new Date(`${s}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

const WORKFLOW = ["application", "exam_scheduled", "course_done"];

export default function Leads() {
  const router = useRouter();
  const { user } = useAuth();
  const coordinator = user?.role === "exam_coordinator";
  const params = useLocalSearchParams<{ stage?: string; alert?: string }>();
  const [stage, setStage] = useState<string>(params.stage ?? (coordinator ? "application" : ""));
  const [search, setSearch] = useState("");
  // Exam Scheduled tab: only "exam done, payment due"
  const [alertOnly, setAlertOnly] = useState(params.alert === "1");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);
  const [starting, setStarting] = useState<number | null>(null);
  const [added, setAdded] = useState("");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);

  const pickCustom = async () => {
    const from = await pickDateTime(custom ? new Date(`${custom.from}T00:00:00`) : new Date(Date.now() - 7 * 86400e3), { dateOnly: true });
    if (!from) return;
    const to = await pickDateTime(custom ? new Date(`${custom.to}T00:00:00`) : new Date(), { dateOnly: true });
    if (!to) return;
    const [a, b] = from <= to ? [from, to] : [to, from];
    setRows(null);
    setAdded("");
    setCustom({ from: ymd(a), to: ymd(b) });
  };

  useEffect(() => {
    if (params.stage !== undefined) setStage(params.stage);
    setAlertOnly(params.alert === "1");
  }, [params.stage, params.alert]);
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (p = 1) => {
      try {
        const d = await api("/crm/leads", {
          query: { stage: stage || undefined, search: query || undefined, alert: stage === "exam_scheduled" && alertOnly ? "1" : undefined, added: added || undefined, from: custom?.from, to: custom?.to, page: p, limit: 25 },
        });
        setCounts(d.counts ?? {});
        setPages(d.pagination?.totalPages ?? 1);
        setPage(p);
        setRows((r) => (p === 1 ? d.leads : [...(r ?? []), ...d.leads]));
        setError("");
      } catch (e: any) {
        setError(e.message);
        if (p === 1) setRows([]);
      }
    },
    [stage, query, alertOnly, added, custom]
  );
  useFocusEffect(
    useCallback(() => {
      load(1);
    }, [load])
  );

  // "All" leaves out the Backlog (it has its own tab); a search still includes it
  const total = Object.values(counts).reduce((a, b) => a + b, 0) - (query.trim() ? 0 : counts.backlog ?? 0);
  const tabs = coordinator ? STAGES.filter(([k]) => WORKFLOW.includes(k)) : STAGES;

  return (
    <View style={{ flex: 1 }}>
      <View style={st.top}>
        <View style={st.search}>
          <Ionicons name="search" size={16} color={C.faint} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search name, phone or email" placeholderTextColor={C.faint} style={st.searchInput} />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color={C.faint} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 10 }}>
          {!coordinator && <Chip label="All Leads" count={total} active={stage === ""} onPress={() => { setRows(null); setStage(""); }} />}
          {tabs.map(([k, label]) => (
            <Chip key={k} label={label} count={counts[k] ?? 0} active={stage === k} onPress={() => { setRows(null); setStage(k); }} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 10, alignItems: "center" }}>
          <Ionicons name="calendar-outline" size={16} color={C.faint} accessibilityLabel="Lead added" />
          {RANGES.map(([k, label]) => (
            <Chip key={k || "any"} label={label} active={!custom && added === k} onPress={() => { setRows(null); setCustom(null); setAdded(k); }} />
          ))}
          <Chip label={custom ? `${short(custom.from)} – ${short(custom.to)}` : "Custom"} active={!!custom} onPress={pickCustom} />
        </ScrollView>
        {stage === "exam_scheduled" && (
          <View style={{ flexDirection: "row", paddingBottom: 8 }}>
            <Chip tone="danger" label={alertOnly ? "✓ Exam done, payment due" : "Exam done, payment due"} active={alertOnly} onPress={() => { setRows(null); setAlertOnly((v) => !v); }} />
          </View>
        )}
      </View>

      {error ? <Text style={st.error}>{error}</Text> : null}
      {rows === null ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(1); setRefreshing(false); }} />}
          onEndReachedThreshold={0.4}
          onEndReached={async () => {
            if (loadingMore.current || page >= pages) return;
            loadingMore.current = true;
            await load(page + 1);
            loadingMore.current = false;
          }}
          ListEmptyComponent={<Empty icon="people-outline" text={query ? "No leads match your search." : added || custom ? "No leads added in this time range." : "No leads here."} />}
          renderItem={({ item: l }) => (
            <Pressable onPress={() => router.push(`/lead/${l.id}`)}>
              <Card style={l.payment_alert ? { borderColor: "#FCA5A5", backgroundColor: "#FFF5F5" } : undefined}>
                <View style={st.row}>
                  {l.is_new ? <View style={st.newDot} accessibilityLabel="New lead, not opened yet" /> : null}
                  <Text style={st.name} numberOfLines={1}>{l.name}</Text>
                  <StageBadge stage={l.stage} />
                </View>
                {l.is_new ? <Text style={st.newText}>New lead — not opened yet</Text> : null}
                {l.stage === "backlog" && !coordinator ? (
                  <Pressable
                    onPress={async () => {
                      setStarting(l.id);
                      try {
                        await api(`/crm/leads/${l.id}/stage`, { method: "POST", body: { stage: "attempting_contact" } });
                        await load(1);
                      } catch (e: any) {
                        Alert.alert("Couldn't move the lead", e.message);
                      } finally {
                        setStarting(null);
                      }
                    }}
                    disabled={starting === l.id}
                    style={st.startBtn}
                  >
                    <Ionicons name="play" size={12} color={C.primary} />
                    <Text style={st.startText}>{starting === l.id ? "Moving…" : "Start: Attempting Contact"}</Text>
                  </Pressable>
                ) : null}
                <Text style={st.meta} numberOfLines={1}>
                  {l.course_title || "No course"}
                  {coordinator && l.owner_name ? ` · ${l.owner_name}` : ""}
                </Text>
                {l.payment_alert ? <Text style={st.alert}>Exam done · payment due</Text> : null}
                {l.next_follow_up_at ? (
                  <Text style={[st.follow, isOverdue(l.next_follow_up_at) && { color: C.red }]}>
                    <Ionicons name="calendar-outline" size={12} /> Follow-up {fmtDateTime(l.next_follow_up_at)}
                    {isOverdue(l.next_follow_up_at) ? " · overdue" : ""}
                  </Text>
                ) : null}
                {l.last_discussion ? (
                  <Text style={st.last} numberOfLines={2}>
                    <Text style={{ fontWeight: "700" }}>{ago(l.last_discussion_at)}: </Text>
                    {l.last_discussion}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  top: { paddingHorizontal: 14, paddingTop: 12, backgroundColor: C.page },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: C.ink },
  error: { color: C.red, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: "700", color: C.ink },
  newDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red },
  newText: { color: C.red, fontWeight: "700", fontSize: 12, marginTop: 2 },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 8, borderWidth: 1, borderColor: C.paleLine, backgroundColor: C.pale, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  startText: { color: C.primary, fontWeight: "800", fontSize: 12.5 },
  meta: { color: C.muted, marginTop: 3 },
  alert: { color: C.red, fontWeight: "700", marginTop: 5, fontSize: 13 },
  follow: { color: C.primary, fontWeight: "600", marginTop: 6, fontSize: 13 },
  last: { color: C.ink, marginTop: 6, fontSize: 13 },
});
