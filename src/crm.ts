// Pipeline stages, labels and colours — same as the website CRM.
export const STAGES: [string, string, string, string][] = [
  // key, label, background, text
  ["backlog", "Backlog", "#F5F5F4", "#44403C"],
  ["new", "New Leads", "#F0F9FF", "#0369A1"],
  ["attempting_contact", "Attempting Contact", "#EEF2FF", "#4338CA"],
  ["in_conversation", "In Conversation", "#F5F3FF", "#6D28D9"],
  ["application", "Application", "#EAF2F9", "#275382"],
  ["exam_scheduled", "Exam Scheduled", "#FFFBEB", "#92400E"],
  ["course_done", "Course Done", "#ECFDF5", "#047857"],
  ["no_response", "No Response", "#FFF7ED", "#C2410C"],
  ["on_hold", "On Hold", "#FFFBEB", "#B45309"],
  ["not_interested", "Not Interested", "#F1F5F9", "#475569"],
  ["junk", "Junk Lead", "#FEF2F2", "#B91C1C"],
];
export const STAGE = Object.fromEntries(STAGES.map(([k, label, bg, fg]) => [k, { label, bg, fg }]));
export const stageLabel = (s?: string | null) => (s ? STAGE[s]?.label ?? s : "");

/** Moving here needs a reason (the server enforces it too). */
export const REASON_STAGES = ["on_hold", "not_interested", "junk"];
export const CLOSED = ["not_interested", "junk"];

export const ACTIVITY_TYPES: [string, string][] = [
  ["note", "Note"],
  ["call", "Call"],
  ["whatsapp", "WhatsApp"],
  ["message", "Message"],
  ["email", "Email"],
];
export const FOLLOW_UP_TYPES: [string, string][] = [
  ["call", "Call"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
  ["meeting", "Meeting"],
  ["demo", "Demo"],
  ["other", "Other"],
];

export const fmtDateTime = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "—";
export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const ago = (d?: string | null) => {
  if (!d) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 60) return m < 2 ? "just now" : `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
export const isOverdue = (d?: string | null) => !!d && new Date(d).getTime() < Date.now();
export const money = (amount?: number | null, currency?: string | null) =>
  amount == null
    ? "Not set"
    : new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
        style: "currency",
        currency: currency || "INR",
        maximumFractionDigits: 0,
      }).format(amount);

/** Timeline wording for each activity type. */
export function activityTitle(a: { type: string; meta?: any }): string {
  const m = a.meta ?? {};
  switch (a.type) {
    case "created":
      return "Lead created";
    case "assignment":
      return "Lead assigned";
    case "status_change":
      return `${stageLabel(m.from)} → ${stageLabel(m.to)}${m.automatic || m.automation ? " (automatic)" : ""}`;
    case "note":
      return "Note";
    case "call":
      return "Call";
    case "message":
      return "Message";
    case "email":
      return "Email";
    case "whatsapp":
      return "WhatsApp";
    case "whatsapp_in":
      return "WhatsApp from client";
    case "whatsapp_api":
      return "WhatsApp sent";
    case "follow_up_scheduled":
      return `Follow-up scheduled (${m.type ?? "call"}) for ${fmtDateTime(m.due_at)}`;
    case "follow_up_done":
      return "Follow-up done";
    case "follow_up_missed":
      return "Follow-up missed";
    case "follow_up_cancelled":
      return "Follow-up cancelled";
    case "exam_scheduled":
      return `Exam scheduled for ${fmtDateTime(m.scheduled_at)}`;
    case "exam_rescheduled":
      return `Exam rescheduled${m.previous_at ? ` from ${fmtDateTime(m.previous_at)}` : ""} to ${fmtDateTime(m.scheduled_at)}`;
    case "exam_cancelled":
      return `Exam cancelled${m.scheduled_at ? ` (was ${fmtDateTime(m.scheduled_at)})` : ""}`;
    case "exam_completed":
      return `Exam done${m.automatic ? " (exam time passed)" : ""}`;
    case "application_update":
      return m.submitted ? `Application submitted${m.submitted_at ? ` on ${fmtDate(m.submitted_at)}` : ""}` : "Application marked not submitted";
    case "payment_done":
      return `Payment Done${m.reference ? ` · ${m.reference}` : ""}`;
    case "payment_due":
      return "Payment set back to due";
    case "exam_coordinator":
      return m.to ? "Exam coordinator assigned" : "Exam coordinator removed";
    case "updated":
      return "Details updated";
    case "repeat_enquiry":
      return `Enquired again via ${(m.form === "contact" ? "Contact form" : m.form) || m.source || "a form"}${m.campaign ? ` (${m.campaign})` : ""}`;
    default:
      return a.type.replace(/_/g, " ");
  }
}

// ── What the person told us on the form (source_meta.answers) — same as the website ──
const ANSWER_LABEL: Record<string, string> = {
  preferred_time: "Best time to call",
  message: "Message",
  company: "Company",
  team_size: "Team size",
  subject: "Subject",
};

/** "what_is_your_budget?" → "What is your budget" */
export const answerLabel = (key: string) => {
  if (ANSWER_LABEL[key]) return ANSWER_LABEL[key];
  const text = String(key ?? "").replace(/[_]+/g, " ").replace(/[?:]+$/, "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Answer";
};

/** Answers as [label, value] pairs, best time and message first, empty ones left out. */
export const answerEntries = (answers: any): [string, string][] => {
  if (!answers || typeof answers !== "object") return [];
  const order = ["preferred_time", "message"];
  return Object.entries(answers)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([k, v]) => [answerLabel(k), String(v)]);
};

/** Form name for people: "contact" → "Contact form". */
export const formLabel = (form?: string | null) => (form === "contact" ? "Contact form" : form || null);
