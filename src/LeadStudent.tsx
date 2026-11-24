import { useEffect, useState } from "react";
import { Alert, Share, StyleSheet, Text, View } from "react-native";
import { api } from "./api";
import { Button, Card, Chip, Field, SectionTitle, Sheet } from "./ui";
import { C } from "./theme";

type Course = { id: number; title: string; price?: number | string };
type Mode = null | "assign" | "discount" | "certificate";

let courseCache: Course[] | null = null;
export const loadCourses = async (): Promise<Course[]> => {
  if (courseCache) return courseCache;
  const list = await api<Course[]>("/courses", { query: { limit: 100 } }).catch(() => []);
  courseCache = Array.isArray(list) ? list : [];
  return courseCache;
};

function CourseChoices({ courses, value, onChange }: { courses: Course[] | null; value: number | null; onChange: (id: number) => void }) {
  if (courses === null) return <Text style={st.hint}>Loading courses…</Text>;
  if (!courses.length) return <Text style={st.hint}>No courses found.</Text>;
  return (
    <View style={st.chips}>
      {courses.map((c) => (
        <Chip key={c.id} label={c.title} active={value === c.id} onPress={() => onChange(c.id)} />
      ))}
    </View>
  );
}

/**
 * Student and course actions on a lead, as on the website: create the student
 * account, assign a course (free access), send a discount link, issue a
 * certificate. The server checks ownership, limits and eligibility.
 */
export function StudentSection({ lead, isAdmin, onChanged }: { lead: any; isAdmin: boolean; onChanged: () => Promise<void> | void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try {
      const r = await fn();
      await onChanged();
      Alert.alert("Done", ok);
      return r ?? true;
    } catch (e: any) {
      Alert.alert("That didn't work", e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle>Student & course</SectionTitle>
      <Card>
        {!lead.user_id ? (
          <>
            <Text style={st.body}>No student account yet. Create one to assign courses or issue certificates. They get an email to set their password.</Text>
            <View style={{ marginTop: 10 }}>
              <Button
                small
                icon="person-add-outline"
                title="Create student account"
                busy={busy}
                disabled={!lead.email}
                onPress={() =>
                  run(() => api(`/crm/leads/${lead.id}/student-account`, { method: "POST" }), "Student account ready. They were emailed a link to set a password.")
                }
              />
            </View>
            {!lead.email ? <Text style={[st.hint, { color: "#B45309" }]}>Add the lead's email first.</Text> : null}
          </>
        ) : (
          <Text style={st.body}>
            Student account: <Text style={{ fontWeight: "800", color: C.ink }}>{lead.student_email ?? lead.email}</Text>
          </Text>
        )}
        <View style={[st.chips, { marginTop: 12 }]}>
          <Button small kind="secondary" icon="book-outline" title="Assign course" disabled={!lead.user_id} onPress={() => setMode("assign")} />
          <Button small kind="secondary" icon="pricetag-outline" title="Discount link" onPress={() => setMode("discount")} />
          <Button small kind="secondary" icon="ribbon-outline" title="Certificate" disabled={!lead.user_id} onPress={() => setMode("certificate")} />
        </View>
      </Card>
      <ActionSheet mode={mode} lead={lead} isAdmin={isAdmin} busy={busy} onClose={() => setMode(null)} run={run} />
    </>
  );
}

function ActionSheet({ mode, lead, isAdmin, busy, onClose, run }: { mode: Mode; lead: any; isAdmin: boolean; busy: boolean; onClose: () => void; run: (fn: () => Promise<any>, ok: string) => Promise<any> }) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [courseId, setCourseId] = useState<number | null>(lead.course_id ?? null);
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("48");
  const [override, setOverride] = useState("");
  useEffect(() => {
    if (!mode) return;
    setCourseId(lead.course_id ?? null);
    setNote("");
    setPrice("");
    setHours("48");
    setOverride("");
    loadCourses().then(setCourses);
  }, [mode, lead.course_id]);
  const course = courses?.find((c) => c.id === courseId);
  const list = Number(course?.price ?? 0);

  const submit = async () => {
    if (!courseId) return Alert.alert("Choose a course");
    if (mode === "assign") {
      if (await run(() => api(`/crm/leads/${lead.id}/assign-course`, { method: "POST", body: { course_id: courseId, note: note.trim() || undefined } }), "Course assigned. The student was emailed."))
        onClose();
    } else if (mode === "discount") {
      if (price === "" || Number(price) < 0) return Alert.alert("Enter the discounted price");
      const r = await run(
        () => api<any>(`/crm/leads/${lead.id}/discount-link`, { method: "POST", body: { course_id: courseId, discount_price: Number(price), expiry_hours: Number(hours) || 48 } }),
        `Discount link emailed to ${lead.student_email ?? lead.email ?? "the lead"}.`
      );
      if (r) {
        onClose();
        const url = r?.link?.offer_url;
        if (url) Share.share({ message: url }).catch(() => {});
      }
    } else if (mode === "certificate") {
      if (await run(() => api(`/crm/leads/${lead.id}/certificate`, { method: "POST", body: { course_id: courseId, override_reason: override.trim() || undefined } }), "Certificate issued."))
        onClose();
    }
  };

  const title = mode === "assign" ? "Assign course" : mode === "discount" ? "Send discount link" : "Issue certificate";
  return (
    <Sheet visible={!!mode} title={title} onClose={onClose}>
      <Text style={st.label}>Course</Text>
      <CourseChoices courses={courses} value={courseId} onChange={setCourseId} />
      {mode === "assign" ? (
        <>
          <Field label="Note (optional)" value={note} onChangeText={setNote} />
          <Text style={st.hint}>Gives free access to the course. The student is emailed.</Text>
        </>
      ) : null}
      {mode === "discount" ? (
        <>
          <Field label={`Price (US$)${list ? ` · list $${list}` : ""}`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          <Field label="Valid for (hours)" value={hours} onChangeText={setHours} keyboardType="number-pad" />
          {list > 0 && price !== "" ? (
            <Text style={st.hint}>
              {Math.round(((list - Number(price)) / list) * 100)}% off.{isAdmin ? "" : " Large discounts need an Admin."} It's emailed to the lead, and you can share the link too. It
              only counts as a sale once paid.
            </Text>
          ) : null}
        </>
      ) : null}
      {mode === "certificate" ? (
        <>
          <Text style={st.hint}>Issued only when the student has completed the course (all lessons and every exam).</Text>
          {isAdmin ? <Field label="Admin override reason (only if not complete)" value={override} onChangeText={setOverride} /> : null}
        </>
      ) : null}
      <View style={{ marginTop: 12 }}>
        <Button title={title} busy={busy} onPress={submit} />
      </View>
    </Sheet>
  );
}

/** Edit the lead's name, email and course of interest (the source phone stays as it came in). */
export function DetailsSheet({ visible, lead, busy, onClose, onSave }: { visible: boolean; lead: any; busy: boolean; onClose: () => void; onSave: (body: any) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [courseId, setCourseId] = useState<number | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    setName(lead.name ?? "");
    setEmail(lead.email ?? "");
    setCourseId(lead.course_id ?? null);
    loadCourses().then(setCourses);
  }, [visible, lead]);
  const save = () => {
    if (name.trim().length < 2) return Alert.alert("Enter the lead's name");
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert("Check the email address");
    const body: any = {};
    if (name.trim() !== lead.name) body.name = name.trim();
    if ((email.trim() || null) !== (lead.email || null)) body.email = email.trim() || null;
    if (courseId !== (lead.course_id ?? null)) body.course_id = courseId;
    if (!Object.keys(body).length) return onClose();
    onSave(body);
  };
  return (
    <Sheet visible={visible} title="Edit details" onClose={onClose}>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Text style={st.label}>Course of interest</Text>
      <CourseChoices courses={courses} value={courseId} onChange={(id) => setCourseId(id === courseId ? null : id)} />
      <Button title="Save" busy={busy} onPress={save} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  hint: { color: C.muted, fontSize: 12, marginTop: 6, marginBottom: 6, lineHeight: 17 },
  label: { color: C.muted, fontWeight: "700", fontSize: 13, marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
});
