// Account sync: mirrors InterviewX progress between localStorage (fast, synchronous cache used by
// every page) and the signed-in user's rows in Lovable Cloud (tables created by Lovable in
// drizzle/migrations). Row-level security limits every query to the user's own records.
import { supabase } from "@/integrations/supabase/client";
import { setWriteListener, writeLocal, readLocal, EMPTY_PROFILE } from "./storage.js";

const KEYS = {
  history: "interviewx:history",
  activity: "interviewx:activity",
  profile: "interviewx:profile",
  roadmap: "interviewx:roadmap",
  resume: "interviewx:resume",
  challenge: "interviewx:challenge",
};

let userId = null;
const uploaded = { interviews: new Set(), activities: new Set(), days: new Set() };

// ---------- row mapping ----------
const interviewToRow = (e) => ({
  id: e.id,
  user_id: userId,
  role: e.config?.role ?? "",
  difficulty: e.config?.difficulty ?? "",
  type: e.config?.type ?? "",
  score: e.overall ?? 0,
  count: e.items?.length ?? 0,
  mode: e.mode || "practice",
  ai: e.ai ?? null,
  items: e.items ?? [],
  summary: e.summary ?? {},
  completed_at: e.date,
});
const rowToInterview = (r) => ({
  id: r.id,
  date: r.completed_at,
  config: { role: r.role, difficulty: r.difficulty, type: r.type, count: r.count },
  mode: r.mode,
  ai: r.ai,
  items: r.items ?? [],
  overall: r.score,
  summary: r.summary,
});
const activityToRow = (a) => ({
  id: a.id,
  user_id: userId,
  type: a.type,
  title: a.title,
  detail: a.detail ?? "",
  score: a.score == null ? null : Math.round(a.score),
  data: a.data ?? null,
  happened_at: a.date,
});
const rowToActivity = (r) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  detail: r.detail,
  score: r.score,
  data: r.data,
  date: r.happened_at,
});
const profileToRow = (p) => ({
  user_id: userId,
  name: p.name ?? "",
  email: p.email ?? "",
  college: p.college ?? "",
  degree: p.degree ?? "",
  grad_year: p.gradYear ?? "",
  target_role: p.targetRole ?? "",
  bio: p.bio ?? "",
  updated_at: new Date().toISOString(),
});
const rowToProfile = (r) => ({
  name: r.name,
  email: r.email,
  college: r.college,
  degree: r.degree,
  gradYear: r.grad_year,
  targetRole: r.target_role,
  bio: r.bio,
});
const challengeToRow = (day, c) => ({
  user_id: userId,
  day,
  question: c.question ?? "",
  answer: c.answer ?? "",
  feedback: { ...c.feedback, _mode: c.mode ?? null },
});
const rowToChallenge = (r) => {
  const { _mode, ...feedback } = r.feedback ?? {};
  return { question: r.question, answer: r.answer, feedback, mode: _mode ?? "ai" };
};

function report(error, what) {
  if (error)
    console.warn(`[InterviewX] Could not save ${what} to your account:`, error.message ?? error);
}

// ---------- upload on every local write ----------
async function onWrite(key, value) {
  if (!userId) return;
  const uid = userId;
  try {
    if (key === "*") {
      // "Reset all my data": delete this account's saved records.
      const tables = [
        "interviews",
        "activities",
        "daily_challenges",
        "resume_analyses",
        "roadmap_progress",
        "profiles",
      ];
      const results = await Promise.all(
        tables.map((t) => supabase.from(t).delete().eq("user_id", uid)),
      );
      results.forEach((r, i) => report(r.error, tables[i]));
      Object.values(uploaded).forEach((s) => s.clear());
    } else if (key === KEYS.history) {
      if (!value?.length) {
        const { error } = await supabase.from("interviews").delete().eq("user_id", uid);
        report(error, "interview history");
        uploaded.interviews.clear();
        return;
      }
      const fresh = value.filter((e) => !uploaded.interviews.has(e.id));
      if (!fresh.length) return;
      const { error } = await supabase.from("interviews").upsert(fresh.map(interviewToRow));
      report(error, "interview");
      if (!error) fresh.forEach((e) => uploaded.interviews.add(e.id));
    } else if (key === KEYS.activity) {
      const fresh = (value ?? []).filter((a) => !uploaded.activities.has(a.id));
      if (!fresh.length) return;
      const { error } = await supabase.from("activities").upsert(fresh.map(activityToRow));
      report(error, "activity");
      if (!error) fresh.forEach((a) => uploaded.activities.add(a.id));
    } else if (key === KEYS.profile) {
      const { error } = await supabase.from("profiles").upsert(profileToRow(value));
      report(error, "profile");
    } else if (key === KEYS.roadmap) {
      const { error } = await supabase.from("roadmap_progress").upsert({
        user_id: uid,
        selected: value?.selected ?? null,
        done: value?.done ?? {},
        updated_at: new Date().toISOString(),
      });
      report(error, "roadmap progress");
    } else if (key === KEYS.resume) {
      if (!value) return;
      const { error } = await supabase
        .from("resume_analyses")
        .upsert(
          { user_id: uid, result: value, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      report(error, "resume analysis");
    } else if (key === KEYS.challenge) {
      const fresh = Object.entries(value ?? {}).filter(([day]) => !uploaded.days.has(day));
      if (!fresh.length) return;
      const { error } = await supabase
        .from("daily_challenges")
        .upsert(fresh.map(([day, c]) => challengeToRow(day, c)));
      report(error, "daily challenge");
      if (!error) fresh.forEach(([day]) => uploaded.days.add(day));
    }
  } catch (e) {
    report(e, key);
  }
}

// ---------- download + merge on sign-in ----------
const byDate = (a, b) => new Date(a.date) - new Date(b.date);

/**
 * Loads the account's saved progress, merges in anything practised locally before signing in
 * (uploading it), and refreshes the local cache. Resolves when done.
 */
export async function startSync(user) {
  userId = user.id;
  Object.values(uploaded).forEach((s) => s.clear());
  setWriteListener(onWrite);

  const [profile, interviews, activities, roadmap, resume, challenges] = await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    supabase.from("interviews").select("*").order("completed_at", { ascending: true }).limit(200),
    supabase.from("activities").select("*").order("happened_at", { ascending: true }).limit(500),
    supabase.from("roadmap_progress").select("*").maybeSingle(),
    supabase.from("resume_analyses").select("*").maybeSingle(),
    supabase.from("daily_challenges").select("*"),
  ]);
  const failed = [profile, interviews, activities, roadmap, resume, challenges].find(
    (r) => r.error,
  );
  if (failed) throw failed.error;

  // Interviews & activities: union by id; upload local-only entries.
  const mergeList = (key, rows, fromRow, set, limit) => {
    const cloud = rows.map(fromRow);
    cloud.forEach((x) => set.add(x.id));
    const local = readLocal(key, []);
    const ids = new Set(cloud.map((x) => x.id));
    const merged = [...cloud, ...local.filter((x) => !ids.has(x.id))].sort(byDate).slice(-limit);
    writeLocal(key, merged);
    return onWrite(key, merged);
  };
  await mergeList(KEYS.history, interviews.data, rowToInterview, uploaded.interviews, 50);
  await mergeList(KEYS.activity, activities.data, rowToActivity, uploaded.activities, 300);

  // Profile: account copy wins; otherwise upload local or prefill from the Google account.
  if (profile.data) {
    writeLocal(KEYS.profile, rowToProfile(profile.data));
  } else {
    const local = { ...EMPTY_PROFILE, ...readLocal(KEYS.profile, {}) };
    const meta = user.user_metadata ?? {};
    const prefilled = {
      ...local,
      name: local.name || meta.full_name || meta.name || "",
      email: local.email || user.email || "",
    };
    writeLocal(KEYS.profile, prefilled);
    await onWrite(KEYS.profile, prefilled);
  }

  // Roadmap & resume: account copy wins; otherwise upload what's local.
  if (roadmap.data) {
    writeLocal(KEYS.roadmap, { selected: roadmap.data.selected, done: roadmap.data.done ?? {} });
  } else {
    const local = readLocal(KEYS.roadmap, null);
    if (local?.selected || Object.keys(local?.done ?? {}).length)
      await onWrite(KEYS.roadmap, local);
  }
  if (resume.data) {
    writeLocal(KEYS.resume, resume.data.result);
  } else {
    const local = readLocal(KEYS.resume, null);
    if (local) await onWrite(KEYS.resume, local);
  }

  // Daily challenges: union by day.
  const cloudDays = Object.fromEntries(challenges.data.map((r) => [r.day, rowToChallenge(r)]));
  Object.keys(cloudDays).forEach((d) => uploaded.days.add(d));
  const mergedDays = { ...readLocal(KEYS.challenge, {}), ...cloudDays };
  writeLocal(KEYS.challenge, mergedDays);
  await onWrite(KEYS.challenge, mergedDays);
}

/** Stops syncing and removes the signed-out account's cached progress from this browser. */
export function stopSync({ clearCache } = { clearCache: true }) {
  const wasSignedIn = Boolean(userId);
  userId = null;
  setWriteListener(null);
  if (wasSignedIn && clearCache) {
    try {
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("interviewx:data", { detail: "*" }));
  }
}
