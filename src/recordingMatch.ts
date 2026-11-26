/**
 * Matches the phone dialer's call recordings to lead calls from the call log.
 * Pure functions (no device access), so they can be tested on their own.
 *
 * A recording belongs to a call when its time fits the call (the time in the
 * file name ≈ the call start, or the file was saved ≈ when the call ended), its
 * length fits the call's length, and — if the file name has a phone number —
 * that number is the lead's. Anything that doesn't match a lead's call is never
 * uploaded.
 */

export type LeadCall = { lead_id: number; number: string; direction: "incoming" | "outgoing"; date: number; duration: number };
export type RecordingFile = { id: string; name: string; size: number; added: number; modified: number; duration: number };

const last10 = (v: string) => String(v ?? "").replace(/\D/g, "").slice(-10);

/** The date-time written in a recording's file name (phone's local time), if any. */
export function timeFromName(name: string, now = Date.now()): number | null {
  const tries: [RegExp, (m: RegExpMatchArray) => number[]][] = [
    // 20261126143015, 20261126_143015, 2026-11-26 14-30-15, 2026_11_26_14_30_15
    [/(20\d{2})[-_ .]?(\d{2})[-_ .]?(\d{2})[-_ .T]?(\d{2})[-_ .:h]?(\d{2})[-_ .:m]?(\d{2})/, (m) => [+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]]],
    // Samsung: 261126_143015
    [/(?:^|\D)(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:\D|$)/, (m) => [2000 + +m[1], +m[2], +m[3], +m[4], +m[5], +m[6]]],
  ];
  for (const [re, parts] of tries) {
    const m = name.match(re);
    if (!m) continue;
    const [y, mo, d, h, mi, s] = parts(m);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) continue;
    const t = new Date(y, mo - 1, d, h, mi, s).getTime();
    if (Math.abs(t - now) < 30 * 864e5) return t;
  }
  return null;
}

/** Phone numbers (10+ digits) written in a file name, as their last 10 digits. */
const numbersIn = (name: string) =>
  (name.match(/\+?\d[\d ]{8,16}\d/g) ?? [])
    .map((run) => run.replace(/\D/g, ""))
    // 10 digits, or with 91 / 0 in front; longer runs are dates and times
    .filter((d) => d.length === 10 || (d.length === 12 && d.startsWith("91")) || (d.length === 11 && d.startsWith("0")))
    // 2611261500 is a date and time (yyMMddHHmm), not a number
    .filter((d) => !(d.length === 10 && looksLikeStamp(d)))
    .map(last10);

const looksLikeStamp = (d: string) => {
  const [mo, day, h, mi] = [d.slice(2, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8, 10)].map(Number);
  return d.startsWith("2") && mo >= 1 && mo <= 12 && day >= 1 && day <= 31 && h <= 23 && mi <= 59;
};

/** How well a recording fits a call (lower is better), or null if it doesn't. */
export function fit(file: RecordingFile, call: LeadCall, now = Date.now()): number | null {
  if (call.duration <= 0) return null; // nobody spoke → nothing recorded
  const start = call.date;
  const end = call.date + call.duration * 1000;
  const named = timeFromName(file.name, now);
  const gaps = [
    named != null ? Math.abs(named - start) : Infinity,
    file.added ? Math.abs(file.added - end) : Infinity,
    file.modified ? Math.abs(file.modified - end) : Infinity,
  ];
  const gap = Math.min(...gaps);
  const allowed = named != null && gaps[0] === gap ? 120e3 : 180e3;
  if (gap > allowed) return null;
  if (file.duration > 0) {
    const sec = file.duration / 1000;
    // Outgoing recordings can include the ringing before the lead picked up
    if (sec < call.duration - 15 || sec > call.duration + 90) return null;
  }
  const nums = numbersIn(file.name);
  if (nums.length && !nums.includes(last10(call.number))) return null;
  return gap;
}

/** Each recording → its best lead call (each call used once). */
export function matchRecordings(files: RecordingFile[], calls: LeadCall[], now = Date.now()) {
  const pairs: { file: RecordingFile; call: LeadCall; score: number }[] = [];
  for (const file of files)
    for (const call of calls) {
      const score = fit(file, call, now);
      if (score != null) pairs.push({ file, call, score });
    }
  pairs.sort((a, b) => a.score - b.score);
  const usedFiles = new Set<string>();
  const usedCalls = new Set<LeadCall>();
  const out: { file: RecordingFile; call: LeadCall }[] = [];
  for (const p of pairs) {
    if (usedFiles.has(p.file.id) || usedCalls.has(p.call)) continue;
    usedFiles.add(p.file.id);
    usedCalls.add(p.call);
    out.push({ file: p.file, call: p.call });
  }
  return out;
}

/** Key a recording is remembered by once uploaded. */
export const recordingKey = (f: { id: string; size: number }) => `${f.id}|${f.size}`;
