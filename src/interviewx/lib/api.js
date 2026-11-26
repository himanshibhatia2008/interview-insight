// Frontend AI client. Calls the Lovable Cloud function `ai` (supabase/functions/ai), which talks
// to OpenRouter using a server-side secret. The function only serves signed-in users, so when
// nobody is signed in — or AI isn't configured — we fall back to the local, clearly labelled Demo AI.
import { supabase } from "@/integrations/supabase/client";
import { offlineQuestion, offlineEvaluate, offlineSummary } from "./offlineAI.js";

let modePromise = null;

/** Forget the cached mode (call after sign-in / sign-out). */
export function resetAiMode() {
  modePromise = null;
}

/** Resolves to "ai" (cloud AI available) or "demo". */
export function aiMode() {
  if (!modePromise) {
    modePromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return "demo";
      const { data: health, error } = await supabase.functions.invoke("ai", {
        body: { action: "health" },
      });
      return !error && health?.ai ? "ai" : "demo";
    })().catch(() => "demo");
  }
  return modePromise;
}

async function readError(error) {
  // FunctionsHttpError carries the Response in `context`; our function returns { error: "…" }.
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* not JSON */
  }
  return "Couldn't reach the AI interviewer. Check your connection and try again.";
}

async function call(action, payload, offline) {
  if ((await aiMode()) === "demo") return offline(payload);
  const { data, error } = await supabase.functions.invoke("ai", { body: { action, payload } });
  if (error) {
    const err = new Error(await readError(error));
    err.offline = () => offline(payload);
    throw err;
  }
  return data;
}

export const getQuestion = (b) => call("question", b, offlineQuestion);
export const evaluate = (b) => call("evaluate", b, offlineEvaluate);
export const getSummary = (b) => call("summary", b, offlineSummary);
export const analyseResume = (b) =>
  call("resume", b, async ({ text, role }) =>
    (await import("./resume.js")).analyseLocally(text, role),
  );
