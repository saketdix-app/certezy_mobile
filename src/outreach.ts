import { api } from "./api";

/**
 * Opening WhatsApp or email for a lead from the app is recorded in the lead's
 * history (with the message, when one was prepared). The app can't see whether
 * it was then sent, so the entry says it was opened from the app.
 */
export function logOutreach(leadId: number, channel: "whatsapp" | "email", text?: string, subject?: string) {
  const what = channel === "whatsapp" ? "WhatsApp" : "Email";
  const msg = (text ?? "").trim();
  const body = `${what} opened from the app${subject?.trim() ? ` · ${subject.trim()}` : ""}${msg ? `:\n${msg}` : ""}`.slice(0, 5000);
  return api(`/crm/leads/${leadId}/activities`, { method: "POST", body: { type: channel, body } }).catch(() => null);
}
