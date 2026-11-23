import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import {
  ACTIVITY_TYPES,
  CLOSED,
  FOLLOW_UP_TYPES,
  REASON_STAGES,
  activityTitle,
  ago,
  answerEntries,
  formLabel,
  fmtDate,
  fmtDateTime,
  isOverdue,
  money,
  stageLabel,
} from "../../src/crm";
import { pickDateTime } from "../../src/pickDateTime";
import { useAuth } from "../../src/auth";
import { DeviceEventEmitter } from "react-native";
import { LEADS_SEEN } from "../../src/newLeads";
import { STARTERS, fillTemplate, whatsappNumberOf } from "../../src/messages";
import { Button, Card, Chip, Field, Loading, Pill, SectionTitle, Sheet, StageBadge } from "../../src/ui";
import { C } from "../../src/theme";

type Lead = any;

// Contact buttons: brand blue call, WhatsApp green, amber email (white text passes contrast)
const CONTACT = { call: "#2F6496", whatsapp: "#0F7A42", email: "#B45309" };

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<null | "stage" | "log" | "follow" | "cancelExam" | "whatsappNo" | "coordinator">(null);
  const [compose, setCompose] = useState<null | "whatsapp" | "email">(null);
  const [target, setTarget] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setLead(await api(`/crm/leads/${id}`));
      DeviceEventEmitter.emit(LEADS_SEEN); // opening it clears its "new" dot / badge
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  /** Run an update; the API returns the fresh lead (or we reload it). */
  const run = async (fn: () => Promise<any>, done?: string) => {
    setBusy(true);
    try {
      const fresh = await fn();
      if (fresh && fresh.id) setLead(fresh);
      else await load();
      setSheet(null);
      if (done) Alert.alert("Saved", done);
      return true;
    } catch (e: any) {
      Alert.alert("Could not save", e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!lead) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: "Lead" }} />
        {error ? <Text style={{ color: C.red, padding: 16 }}>{error}</Text> : <Loading />}
      </View>
    );
  }

  const access = lead.access ?? {};
  const answers = lead.source_meta?.answers ?? {};
  const next: string[] = lead.allowed_next_stages ?? [];
  const progress: string[] = next.filter((s) => !CLOSED.includes(s));
  const closing: string[] = next.filter((s) => CLOSED.includes(s));
  const inWorkflow = ["application", "exam_scheduled", "course_done"].includes(lead.stage);
  const examLive = ["scheduled", "rescheduled"].includes(lead.exam_status);
  const pending = (lead.follow_ups ?? []).filter((f: any) => f.status === "pending");

  const openStage = (s: string) => {
    setTarget(s);
    setSheet("stage");
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Stack.Screen options={{ title: lead.name }} />

      {/* ── Header ── */}
      <Card>
        <View style={st.rowBetween}>
          <Text style={st.name}>{lead.name}</Text>
          <StageBadge stage={lead.stage} />
        </View>
        <Text style={st.meta}>
          {lead.course_title || "No course"} · {lead.source}
          {lead.owner_name ? ` · ${lead.owner_name}` : ""}
        </Text>
        <Text style={st.metaSmall}>Lead #{lead.id} · added {fmtDate(lead.created_at)}</Text>
        <View style={st.contactRow}>
          {lead.phone ? (
            <>
              <Button small color={CONTACT.call} icon="call" title="Call" onPress={() => Linking.openURL(`tel:${lead.phone}`)} style={st.contactBtn} />
            </>
          ) : null}
          {whatsappNumberOf(lead) ? (
            <Button small color={CONTACT.whatsapp} icon="logo-whatsapp" title="WhatsApp" onPress={() => setCompose("whatsapp")} style={st.contactBtn} />
          ) : null}
          {lead.email ? (
            <Button small color={CONTACT.email} icon="mail" title="Email" onPress={() => setCompose("email")} style={st.contactBtn} />
          ) : null}
        </View>
        <View style={st.infoBox}>
          <Row label="Phone" value={lead.phone ? `${lead.phone}${access.edit_phone ? "" : "  (from lead)"}` : "—"} />
          <View style={[st.rowBetween, { paddingVertical: 4 }]}>
            <Text style={st.rowLabel}>WhatsApp</Text>
            <Pressable disabled={!access.edit} onPress={() => setSheet("whatsappNo")} hitSlop={8}>
              <Text style={[st.rowValue, access.edit && { color: C.primary }]}>
                {lead.whatsapp_number || (access.edit ? "Add number" : "Same as phone")}
              </Text>
            </Pressable>
          </View>
          {lead.email ? <Row label="Email" value={lead.email} /> : null}
        </View>
      </Card>

      {lead.payment_alert ? (
        <View style={st.alert}>
          <Ionicons name="alert-circle" size={18} color={C.red} />
          <Text style={st.alertText}>Exam done but payment is still due. Collect it, then mark Payment Done.</Text>
        </View>
      ) : null}

      {/* Everything the person filled in on the form (any question), like the website */}
      {answerEntries(answers).length > 0 || lead.source_meta?.campaign || formLabel(lead.source_meta?.form_name ?? lead.source_meta?.form) ? (
        <Card style={st.toldUs}>
          <Text style={st.toldTitle}>What they told us</Text>
          {formLabel(lead.source_meta?.form_name ?? lead.source_meta?.form) ? (
            <Answer label="Form" value={String(formLabel(lead.source_meta?.form_name ?? lead.source_meta?.form))} />
          ) : null}
          {lead.source_meta?.campaign ? <Answer label="Campaign" value={lead.source_meta.campaign} /> : null}
          {lead.preferred_schedule ? <Answer label="Preferred schedule" value={lead.preferred_schedule} /> : null}
          {answerEntries(answers).map(([label, value]) => (
            <Answer key={label} label={label} value={value} />
          ))}
        </Card>
      ) : null}

      {/* ── Status ── */}
      {next.length > 0 && (
        <>
          <SectionTitle>Update status</SectionTitle>
          <View style={st.wrap}>
            {progress.map((s) => (
              <Chip key={s} label={`→ ${stageLabel(s)}`} onPress={() => openStage(s)} />
            ))}
          </View>
          {closing.length > 0 && (
            <View style={[st.wrap, { marginTop: 8 }]}>
              {closing.map((s) => (
                <Chip key={s} tone="danger" label={`Close: ${stageLabel(s)}`} onPress={() => openStage(s)} />
              ))}
            </View>
          )}
        </>
      )}

      {/* ── Log & schedule ── */}
      <SectionTitle>Log & schedule</SectionTitle>
      <View style={st.wrap}>
        <Button small icon="create-outline" title="Log call / note" onPress={() => setSheet("log")} />
        {access.follow_ups !== false && <Button small kind="secondary" icon="alarm-outline" title="Schedule follow-up" onPress={() => setSheet("follow")} />}
      </View>

      {pending.length > 0 && (
        <>
          <SectionTitle>Pending follow-ups</SectionTitle>
          <View style={{ gap: 8 }}>
            {pending.map((f: any) => (
              <Card key={f.id} style={isOverdue(f.due_at) ? { borderColor: "#FECACA" } : undefined}>
                <View style={st.rowBetween}>
                  <Text style={[st.body, { fontWeight: "700", textTransform: "capitalize" }]}>{f.type}</Text>
                  <Text style={[st.when, isOverdue(f.due_at) && { color: C.red }]}>{fmtDateTime(f.due_at)}</Text>
                </View>
                {f.note ? <Text style={st.body}>{f.note}</Text> : null}
                {access.follow_ups !== false && (
                  <View style={[st.wrap, { marginTop: 8 }]}>
                    <Button small title="Done" icon="checkmark" disabled={busy} onPress={() => run(() => api(`/crm/follow-ups/${f.id}`, { method: "PATCH", body: { status: "done" } }))} />
                    <Button small kind="secondary" title="Missed" disabled={busy} onPress={() => run(() => api(`/crm/follow-ups/${f.id}`, { method: "PATCH", body: { status: "missed" } }))} />
                  </View>
                )}
              </Card>
            ))}
          </View>
        </>
      )}

      {/* ── Application, exam, payment ── */}
      {(inWorkflow || lead.exam_status !== "not_scheduled" || lead.ticket_size != null) && (
        <>
          <SectionTitle>Progress</SectionTitle>
          <Card>
            <Text style={st.blockTitle}>Application</Text>
            <Row label="Ticket size" value={money(lead.ticket_size, lead.ticket_currency)} />
            <View style={st.rowBetween}>
              <Text style={st.rowLabel}>Exam coordinator</Text>
              {access.update_application ? (
                <Pressable onPress={() => setSheet("coordinator")} accessibilityRole="button" accessibilityLabel="Assign exam coordinator">
                  <Text style={[st.rowValue, { color: lead.exam_coordinator_name ? C.primary : C.red, fontWeight: "700" }]}>
                    {lead.exam_coordinator_name ?? "Assign"} ›
                  </Text>
                </Pressable>
              ) : (
                <Text style={st.rowValue}>{lead.exam_coordinator_name ?? "Not assigned"}</Text>
              )}
            </View>
            <View style={st.rowBetween}>
              <Text style={st.rowLabel}>Application submitted</Text>
              {access.update_application ? (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Chip
                    label="Yes"
                    active={!!lead.application_submitted}
                    onPress={() => !lead.application_submitted && run(() => api(`/crm/leads/${lead.id}/application`, { method: "PUT", body: { submitted: true, submitted_at: new Date().toISOString().slice(0, 10) } }))}
                  />
                  <Chip
                    label="No"
                    active={!lead.application_submitted}
                    onPress={() => lead.application_submitted && run(() => api(`/crm/leads/${lead.id}/application`, { method: "PUT", body: { submitted: false } }))}
                  />
                </View>
              ) : (
                <Text style={st.rowValue}>{lead.application_submitted ? `Yes${lead.application_submitted_at ? `, ${fmtDate(lead.application_submitted_at)}` : ""}` : "No"}</Text>
              )}
            </View>
          </Card>

          <Card style={{ marginTop: 8 }}>
            <View style={st.rowBetween}>
              <Text style={st.blockTitle}>Exam</Text>
              <Pill
                label={{ not_scheduled: "Not scheduled", scheduled: "Scheduled", rescheduled: "Rescheduled", cancelled: "Cancelled" }[lead.exam_status as string] ?? lead.exam_status}
                bg={lead.exam_status === "cancelled" ? C.redSoft : C.pale}
                fg={lead.exam_status === "cancelled" ? C.red : C.navy}
              />
            </View>
            <Row label={lead.exam_status === "cancelled" ? "Was scheduled for" : "Date & time"} value={lead.exam_scheduled_at ? fmtDateTime(lead.exam_scheduled_at) : "Not set"} />
            {lead.exam_status !== "cancelled" && (
              <Row label="Exam done" value={lead.exam_done ? `Yes${lead.exam_completed_at ? `, ${fmtDate(lead.exam_completed_at)}` : ""}` : examLive ? "After the exam time passes" : "No"} />
            )}
            {lead.exam_note ? <Text style={[st.body, lead.exam_status === "cancelled" && { color: C.red }]}>{lead.exam_note}</Text> : null}
            {access.update_exam && lead.stage !== "course_done" && (
              <View style={[st.wrap, { marginTop: 10 }]}>
                <Button
                  small
                  kind="secondary"
                  icon="calendar-outline"
                  title={examLive ? "Change date" : "Schedule exam"}
                  disabled={busy}
                  onPress={async () => {
                    const when = await pickDateTime(lead.exam_scheduled_at && examLive ? new Date(lead.exam_scheduled_at) : new Date());
                    if (!when) return;
                    run(
                      () => api(`/crm/leads/${lead.id}/exam`, { method: "PUT", body: { status: "scheduled", scheduled_at: when.toISOString() } }),
                      lead.stage === "application" ? "Exam scheduled — moved to Exam Scheduled" : undefined
                    );
                  }}
                />
                {examLive && <Button small kind="danger" icon="close-circle-outline" title="Cancel exam" onPress={() => setSheet("cancelExam")} />}
              </View>
            )}
          </Card>

          <Card style={{ marginTop: 8 }}>
            <View style={st.rowBetween}>
              <Text style={st.blockTitle}>Payment</Text>
              <Pill
                label={lead.payment_status === "done" ? "Payment Done" : "Payment Due"}
                bg={lead.payment_status === "done" ? C.greenSoft : "#FFFBEB"}
                fg={lead.payment_status === "done" ? C.green : "#92400E"}
              />
            </View>
            {lead.payment_status === "done" ? (
              <Row label="Paid on" value={fmtDate(lead.payment_done_at)} />
            ) : access.update_payment ? (
              <Button
                small
                icon="checkmark-circle-outline"
                title="Mark Payment Done"
                style={{ marginTop: 8, alignSelf: "flex-start" }}
                disabled={busy}
                onPress={() =>
                  Alert.alert("Payment received?", "This moves the lead to Course Done.", [
                    { text: "Not yet", style: "cancel" },
                    {
                      text: "Payment Done",
                      onPress: () =>
                        run(() => api(`/crm/leads/${lead.id}/payment`, { method: "PUT", body: { status: "done", paid_at: new Date().toISOString() } }), "Moved to Course Done"),
                    },
                  ])
                }
              />
            ) : null}
          </Card>
        </>
      )}

      {/* ── Timeline ── */}
      <SectionTitle>Activity</SectionTitle>
      <Card>
        {(lead.activities ?? []).length === 0 ? (
          <Text style={st.metaSmall}>No activity yet.</Text>
        ) : (
          (lead.activities ?? []).slice(0, 60).map((a: any, i: number) => (
            <View key={a.id} style={[st.tl, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}>
              <Text style={st.tlTitle}>{activityTitle(a)}</Text>
              {a.body ? <Text style={st.body}>{a.body}</Text> : null}
              {a.type === "repeat_enquiry"
                ? answerEntries(a.meta?.answers).map(([label, value]) => (
                    <Text key={label} style={st.body}>
                      <Text style={{ fontWeight: "700" }}>{label}: </Text>
                      {value}
                    </Text>
                  ))
                : null}
              <Text style={st.metaSmall}>
                {a.actor_name ? `${a.actor_name} · ` : ""}
                {fmtDateTime(a.created_at)} ({ago(a.created_at)})
              </Text>
            </View>
          ))
        )}
      </Card>

      <WhatsAppNumberSheet
        visible={sheet === "whatsappNo"}
        lead={lead}
        busy={busy}
        onClose={() => setSheet(null)}
        onSave={(n) => run(() => api(`/crm/leads/${lead.id}`, { method: "PATCH", body: { whatsapp_number: n || null } }), "WhatsApp number saved")}
      />
      <ComposeSheet channel={compose} lead={lead} onClose={() => setCompose(null)} />
      <StageSheet
        visible={sheet === "stage"}
        lead={lead}
        target={target}
        busy={busy}
        onClose={() => setSheet(null)}
        onSave={({ exam_coordinator_id, ...body }) =>
          run(async () => {
            const moved = await api(`/crm/leads/${lead.id}/stage`, { method: "POST", body });
            // Moving to Application: hand it to the chosen Exam Coordinator too
            if (exam_coordinator_id && exam_coordinator_id !== lead.exam_coordinator_id) {
              return api(`/crm/leads/${lead.id}/exam-coordinator`, { method: "PUT", body: { exam_coordinator_id } });
            }
            return moved;
          }, `Moved to ${stageLabel(target)}`)
        }
      />
      <CoordinatorSheet
        visible={sheet === "coordinator"}
        lead={lead}
        busy={busy}
        onClose={() => setSheet(null)}
        onSave={(exam_coordinator_id) =>
          run(
            () => api(`/crm/leads/${lead.id}/exam-coordinator`, { method: "PUT", body: { exam_coordinator_id } }),
            exam_coordinator_id ? "Exam coordinator assigned" : "Exam coordinator removed"
          )
        }
      />
      <LogSheet visible={sheet === "log"} busy={busy} onClose={() => setSheet(null)} onSave={(body) => run(() => api(`/crm/leads/${lead.id}/activities`, { method: "POST", body }))} />
      <FollowSheet visible={sheet === "follow"} busy={busy} onClose={() => setSheet(null)} onSave={(body) => run(() => api(`/crm/leads/${lead.id}/follow-ups`, { method: "POST", body }), "Follow-up scheduled")} />
      <CancelExamSheet
        visible={sheet === "cancelExam"}
        lead={lead}
        busy={busy}
        onClose={() => setSheet(null)}
        onSave={(note) =>
          run(() => api(`/crm/leads/${lead.id}/exam`, { method: "PUT", body: { status: "cancelled", note } }), lead.stage === "exam_scheduled" ? "Exam cancelled — moved back to Application" : "Exam cancelled")
        }
      />
    </ScrollView>
  );
}

function WhatsAppNumberSheet({ visible, lead, busy, onClose, onSave }: { visible: boolean; lead: Lead; busy: boolean; onClose: () => void; onSave: (n: string) => void }) {
  const [n, setN] = useState("");
  useEffect(() => {
    if (visible) setN(lead.whatsapp_number ?? "");
  }, [visible, lead]);
  return (
    <Sheet visible={visible} title="WhatsApp number" onClose={onClose}>
      <Text style={[st.body, { marginBottom: 12 }]}>
        If the lead uses WhatsApp on another number, add it here. The phone from the lead source ({lead.phone || "none"}) stays as it is.
      </Text>
      <Field label="WhatsApp number (with country code)" value={n} onChangeText={setN} keyboardType="phone-pad" placeholder="+91 98765 43210" autoFocus />
      <Button title="Save" icon="checkmark" busy={busy} onPress={() => onSave(n.trim())} />
      {lead.whatsapp_number ? <Button title="Remove (use the phone)" kind="ghost" onPress={() => onSave("")} style={{ marginTop: 6 }} /> : null}
    </Sheet>
  );
}

/** WhatsApp / email with a saved message: lead details filled in, edit, open the app. */
function ComposeSheet({ channel, lead, onClose }: { channel: null | "whatsapp" | "email"; lead: Lead; onClose: () => void }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[] | null>(null);
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [saveAs, setSaveAs] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!channel) return;
    setText(fillTemplate(STARTERS[channel], lead, user));
    setSubject(fillTemplate("About {course} — CERTEZY", lead, user));
    setSaveAs("");
    api<any[]>("/crm/templates")
      .then((all) => setTemplates((all ?? []).filter((t) => t.channel === channel)))
      .catch(() => setTemplates([]));
  }, [channel, lead, user]);
  if (!channel) return null;
  const wa = channel === "whatsapp";
  const open = () => {
    const url = wa
      ? `https://wa.me/${whatsappNumberOf(lead)}?text=${encodeURIComponent(text)}`
      : `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => Alert.alert("Couldn't open", wa ? "Is WhatsApp installed?" : "No email app found."));
    onClose();
  };
  const save = async () => {
    if (saveAs.trim().length < 2) return Alert.alert("Name it", "Give the message a short name, e.g. First contact.");
    setSaving(true);
    try {
      // Save with fill-ins so it works for every lead
      const generic = text
        .split(lead.name ?? "\u0000").join("{name}")
        .split(String(lead.name ?? "").split(" ")[0] || "\u0000").join("{first_name}");
      await api("/crm/templates", { method: "POST", body: { channel, title: saveAs.trim(), subject: wa ? null : subject, body: generic } });
      Alert.alert("Saved", "You'll find it under Saved messages next time.");
      setSaveAs("");
      const all = await api<any[]>("/crm/templates");
      setTemplates((all ?? []).filter((t) => t.channel === channel));
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet visible title={wa ? `WhatsApp ${lead.name}` : `Email ${lead.name}`} onClose={onClose}>
      <Text style={[st.metaSmall, { marginTop: 0, marginBottom: 10 }]}>
        To {wa ? `+${whatsappNumberOf(lead)}${lead.whatsapp_number ? " (WhatsApp number)" : ""}` : lead.email}
      </Text>
      {templates && templates.length > 0 ? (
        <>
          <Text style={st.label}>Saved messages</Text>
          <View style={[st.wrap, { marginBottom: 12 }]}>
            {templates.map((t) => (
              <Chip
                key={t.id}
                label={`${t.title}${t.shared ? " (team)" : ""}`}
                onPress={() => {
                  setText(fillTemplate(t.body, lead, user));
                  if (t.subject) setSubject(fillTemplate(t.subject, lead, user));
                }}
              />
            ))}
          </View>
        </>
      ) : null}
      {!wa ? <Field label="Subject" value={subject} onChangeText={setSubject} /> : null}
      <Field label="Message" value={text} onChangeText={setText} multiline style={{ minHeight: wa ? 110 : 160 }} />
      <Button title={wa ? "Open in WhatsApp" : "Open in email"} icon={wa ? "logo-whatsapp" : "mail"} color={wa ? CONTACT.whatsapp : CONTACT.email} onPress={open} />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 14, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Field value={saveAs} onChangeText={setSaveAs} placeholder="Save this as… (name)" />
        </View>
        <Button small kind="secondary" title="Save" busy={saving} onPress={save} style={{ marginTop: 2 }} />
      </View>
    </Sheet>
  );
}

function Answer({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={st.answerLabel}>{label}</Text>
      <Text style={st.answerValue} selectable>
        {value}
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={[st.rowBetween, { paddingVertical: 4 }]}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={st.rowValue}>{value}</Text>
    </View>
  );
}

function StageSheet({ visible, lead, target, busy, onClose, onSave }: { visible: boolean; lead: Lead; target: string; busy: boolean; onClose: () => void; onSave: (b: any) => void }) {
  const [reason, setReason] = useState("");
  const [ticket, setTicket] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [examAt, setExamAt] = useState<Date | null>(null);
  const [coordinator, setCoordinator] = useState<number | null>(null);
  const [coordinators, setCoordinators] = useState<Coordinator[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    setReason("");
    setCoordinator(lead.exam_coordinator_id ?? null);
    setTicket(lead.ticket_size != null ? String(lead.ticket_size) : "");
    setCurrency(lead.ticket_currency || "INR");
    setExamAt(lead.exam_scheduled_at ? new Date(lead.exam_scheduled_at) : null);
  }, [visible, lead]);

  const needsReason = REASON_STAGES.includes(target) || CLOSED.includes(lead.stage);
  const needsTicket = target === "application";
  const needsExam = target === "exam_scheduled";
  const closing = CLOSED.includes(target);
  useEffect(() => {
    if (visible && needsTicket && coordinators === null) loadCoordinators().then(setCoordinators);
  }, [visible, needsTicket, coordinators]);

  const save = () => {
    if (needsReason && !reason.trim()) return Alert.alert("Reason needed", `Give a reason for ${stageLabel(target)}.`);
    if (needsTicket && !(Number(ticket) > 0)) return Alert.alert("Ticket size needed", "Enter the ticket size to move this lead to Application.");
    if (needsExam && !examAt) return Alert.alert("Exam date needed", "Choose the exam date and time.");
    if (needsTicket && !coordinator && (coordinators?.length ?? 0) > 0)
      return Alert.alert("Exam coordinator needed", "Choose the exam coordinator who will handle this student's application and exam.");
    onSave({
      stage: target,
      ...(reason.trim() && { reason: reason.trim() }),
      ...(needsTicket && { ticket_size: Number(ticket), ticket_currency: currency }),
      ...(needsExam && examAt && { exam_scheduled_at: examAt.toISOString() }),
      ...(needsTicket && coordinator && { exam_coordinator_id: coordinator }),
    });
  };

  return (
    <Sheet visible={visible} title={closing ? `Close lead: ${stageLabel(target)}` : `Move to ${stageLabel(target)}`} onClose={onClose}>
      <Text style={[st.body, { marginBottom: 12 }]}>
        {stageLabel(lead.stage)} → <Text style={{ fontWeight: "800" }}>{stageLabel(target)}</Text>
      </Text>
      {needsTicket && (
        <>
          <Text style={st.label}>Ticket size</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <Chip label="₹ INR" active={currency === "INR"} onPress={() => setCurrency("INR")} />
            <Chip label="$ USD" active={currency === "USD"} onPress={() => setCurrency("USD")} />
          </View>
          <Field value={ticket} onChangeText={setTicket} keyboardType="numeric" placeholder="Amount" />
          <Text style={st.label}>Exam coordinator</Text>
          <CoordinatorChoices list={coordinators} value={coordinator} onChange={setCoordinator} />
        </>
      )}
      {needsExam && (
        <View style={{ marginBottom: 12 }}>
          <Text style={st.label}>Exam date and time</Text>
          <Button
            kind="secondary"
            icon="calendar-outline"
            title={examAt ? fmtDateTime(examAt.toISOString()) : "Choose date & time"}
            onPress={async () => {
              const d = await pickDateTime(examAt ?? new Date());
              if (d) setExamAt(d);
            }}
          />
        </View>
      )}
      <Field
        label={needsReason ? "Reason (required)" : "Note (optional)"}
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder={closing ? "Why is this lead being closed?" : "Add context for the team"}
      />
      <Button title={closing ? `Close as ${stageLabel(target)}` : `Move to ${stageLabel(target)}`} kind={closing ? "danger" : "primary"} busy={busy} onPress={save} />
    </Sheet>
  );
}

function LogSheet({ visible, busy, onClose, onSave }: { visible: boolean; busy: boolean; onClose: () => void; onSave: (b: any) => void }) {
  const [type, setType] = useState("call");
  const [text, setText] = useState("");
  useEffect(() => {
    if (visible) {
      setType("call");
      setText("");
    }
  }, [visible]);
  return (
    <Sheet visible={visible} title="Log activity" onClose={onClose}>
      <View style={[st.wrap, { marginBottom: 12 }]}>
        {ACTIVITY_TYPES.map(([k, l]) => (
          <Chip key={k} label={l} active={type === k} onPress={() => setType(k)} />
        ))}
      </View>
      <Field value={text} onChangeText={setText} multiline placeholder="What was discussed with the client?" />
      <Button title="Save" icon="checkmark" busy={busy} disabled={!text.trim()} onPress={() => onSave({ type, body: text.trim() })} />
    </Sheet>
  );
}

function FollowSheet({ visible, busy, onClose, onSave }: { visible: boolean; busy: boolean; onClose: () => void; onSave: (b: any) => void }) {
  const [type, setType] = useState("call");
  const [when, setWhen] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!visible) return;
    setType("call");
    setNote("");
    const d = new Date(Date.now() + 864e5);
    d.setHours(11, 0, 0, 0);
    setWhen(d);
  }, [visible]);
  const quick = (days: number, hour = 11) => {
    const d = new Date(Date.now() + days * 864e5);
    d.setHours(hour, 0, 0, 0);
    setWhen(d);
  };
  return (
    <Sheet visible={visible} title="Schedule follow-up" onClose={onClose}>
      <View style={[st.wrap, { marginBottom: 12 }]}>
        {FOLLOW_UP_TYPES.map(([k, l]) => (
          <Chip key={k} label={l} active={type === k} onPress={() => setType(k)} />
        ))}
      </View>
      <Text style={st.label}>When</Text>
      <View style={[st.wrap, { marginBottom: 8 }]}>
        <Chip label="In 2 hours" onPress={() => setWhen(new Date(Date.now() + 2 * 3600e3))} />
        <Chip label="Tomorrow" onPress={() => quick(1)} />
        <Chip label="In 3 days" onPress={() => quick(3)} />
        <Chip label="Next week" onPress={() => quick(7)} />
      </View>
      <Button
        kind="secondary"
        icon="calendar-outline"
        title={when ? fmtDateTime(when.toISOString()) : "Choose date & time"}
        style={{ marginBottom: 12 }}
        onPress={async () => {
          const d = await pickDateTime(when ?? new Date());
          if (d) setWhen(d);
        }}
      />
      <Field value={note} onChangeText={setNote} multiline placeholder="Note (optional)" />
      <Button
        title="Schedule"
        icon="alarm-outline"
        busy={busy}
        onPress={() => {
          if (!when) return;
          onSave({ type, due_at: when.toISOString(), ...(note.trim() && { note: note.trim() }) });
        }}
      />
    </Sheet>
  );
}

function CancelExamSheet({ visible, lead, busy, onClose, onSave }: { visible: boolean; lead: Lead; busy: boolean; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (visible) setNote("");
  }, [visible]);
  return (
    <Sheet visible={visible} title="Cancel exam" onClose={onClose}>
      <Text style={[st.body, { marginBottom: 12, color: C.red }]}>
        The exam{lead.exam_scheduled_at ? ` on ${fmtDateTime(lead.exam_scheduled_at)}` : ""} will be cancelled
        {lead.stage === "exam_scheduled" ? " and the lead moved back to Application" : ""}. The date and your remark stay in the history.
      </Text>
      <Field label="Cancellation remark (required)" value={note} onChangeText={setNote} multiline placeholder="Why was the exam cancelled?" />
      <Button title="Cancel exam" kind="danger" busy={busy} disabled={!note.trim()} onPress={() => onSave(note.trim())} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 20, fontWeight: "800", color: C.navy },
  meta: { color: C.muted, marginTop: 4, textTransform: "capitalize" },
  metaSmall: { color: C.faint, fontSize: 12, marginTop: 4 },
  contactRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  contactBtn: { flex: 1, paddingHorizontal: 6, paddingVertical: 10 },
  toldUs: { marginTop: 10, backgroundColor: "#F4F8FC", borderColor: C.paleLine },
  toldTitle: { fontSize: 12, fontWeight: "800", color: C.navy, letterSpacing: 0.8, textTransform: "uppercase" },
  answerLabel: { fontSize: 13, fontWeight: "600", color: C.muted },
  answerValue: { fontSize: 15, color: C.ink, marginTop: 1, lineHeight: 21 },
  infoBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  alert: { flexDirection: "row", gap: 8, backgroundColor: C.redSoft, borderColor: "#FECACA", borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10 },
  alertText: { flex: 1, color: C.red, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "700", color: C.muted, marginBottom: 6 },
  body: { color: C.ink, fontSize: 14, marginTop: 4, lineHeight: 20 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  when: { fontSize: 13, fontWeight: "700", color: C.primary },
  blockTitle: { fontSize: 15, fontWeight: "800", color: C.navy, marginBottom: 4 },
  rowLabel: { color: C.muted, fontSize: 14 },
  rowValue: { color: C.ink, fontSize: 14, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  tl: { paddingVertical: 10 },
  tlTitle: { fontWeight: "700", color: C.ink },
});

type Coordinator = { id: number; name: string; open_exams: number };
const loadCoordinators = () => api<Coordinator[]>("/crm/exam-coordinators").catch(() => [] as Coordinator[]);

/** Pick an Exam Coordinator (their open exam count helps share the work). */
function CoordinatorChoices({ list, value, onChange }: { list: Coordinator[] | null; value: number | null; onChange: (id: number) => void }) {
  if (list === null) return <Text style={[st.body, { marginBottom: 12 }]}>Loading exam coordinators…</Text>;
  if (!list.length) return <Text style={[st.body, { marginBottom: 12 }]}>No exam coordinators yet — ask an admin to add one.</Text>;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {list.map((c) => (
        <Chip key={c.id} label={`${c.name} · ${c.open_exams}`} active={value === c.id} onPress={() => onChange(c.id)} />
      ))}
    </View>
  );
}

function CoordinatorSheet({ visible, lead, busy, onClose, onSave }: { visible: boolean; lead: Lead; busy: boolean; onClose: () => void; onSave: (id: number | null) => void }) {
  const [list, setList] = useState<Coordinator[] | null>(null);
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    if (!visible) return;
    setValue(lead.exam_coordinator_id ?? null);
    loadCoordinators().then(setList);
  }, [visible, lead]);
  return (
    <Sheet visible={visible} title="Exam coordinator" onClose={onClose}>
      <Text style={[st.body, { marginBottom: 12 }]}>
        They see this student in their app and handle the application, exam and payment. You stay the consultant.
      </Text>
      <CoordinatorChoices list={list} value={value} onChange={setValue} />
      <Button
        title="Save"
        busy={busy}
        disabled={!value || value === lead.exam_coordinator_id}
        onPress={() => value && onSave(value)}
      />
      {lead.exam_coordinator_id ? (
        <View style={{ marginTop: 8 }}>
          <Button kind="secondary" title="Remove coordinator" disabled={busy} onPress={() => onSave(null)} />
        </View>
      ) : null}
    </Sheet>
  );
}
