import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { STAGES, ago, fmtDateTime, isOverdue } from "../../src/crm";
import { Card, Chip, Empty, Loading, StageBadge } from "../../src/ui";
import { C } from "../../src/theme";

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
          query: { stage: stage || undefined, search: query || undefined, alert: stage === "exam_scheduled" && alertOnly ? "1" : undefined, page: p, limit: 25 },
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
    [stage, query, alertOnly]
  );
  useFocusEffect(
    useCallback(() => {
      load(1);
    }, [load])
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
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
          {!coordinator && <Chip label="All" count={total} active={stage === ""} onPress={() => { setRows(null); setStage(""); }} />}
          {tabs.map(([k, label]) => (
            <Chip key={k} label={label} count={counts[k] ?? 0} active={stage === k} onPress={() => { setRows(null); setStage(k); }} />
          ))}
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
          ListEmptyComponent={<Empty icon="people-outline" text={query ? "No leads match your search." : "No leads here."} />}
          renderItem={({ item: l }) => (
            <Pressable onPress={() => router.push(`/lead/${l.id}`)}>
              <Card style={l.payment_alert ? { borderColor: "#FCA5A5", backgroundColor: "#FFF5F5" } : undefined}>
                <View style={st.row}>
                  {l.is_new ? <View style={st.newDot} accessibilityLabel="New lead, not opened yet" /> : null}
                  <Text style={st.name} numberOfLines={1}>{l.name}</Text>
                  <StageBadge stage={l.stage} />
                </View>
                {l.is_new ? <Text style={st.newText}>New lead — not opened yet</Text> : null}
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
  meta: { color: C.muted, marginTop: 3 },
  alert: { color: C.red, fontWeight: "700", marginTop: 5, fontSize: 13 },
  follow: { color: C.primary, fontWeight: "600", marginTop: 6, fontSize: 13 },
  last: { color: C.ink, marginTop: 6, fontSize: 13 },
});
