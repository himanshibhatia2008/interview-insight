// Global app state: user settings (theme, sound, mode), the current interview config, AI mode,
// and the signed-in account (Google sign-in through Lovable Cloud).
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { loadSettings, saveSettings } from "./lib/storage.js";
import { aiMode as detectAiMode, resetAiMode } from "./lib/api.js";
import { startSync, stopSync } from "./lib/cloud.js";

const Ctx = createContext(null);

const DEFAULT_CONFIG = {
  role: "Software Developer",
  difficulty: "Beginner",
  type: "HR Round",
  count: 5,
};

function loadConfig() {
  try {
    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(sessionStorage.getItem("interviewx:config") || "{}"),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);
  const [config, setConfigState] = useState(loadConfig);
  const [aiMode, setAiMode] = useState(null);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [sync, setSync] = useState("off"); // off | syncing | synced | error
  const [authError, setAuthError] = useState("");
  // `undefined` = no auth state seen yet, so the first event (signed in or out) always runs.
  const syncedFor = useRef(undefined);

  // Follow the auth session: refresh AI availability and (re)start account sync when the user changes.
  useEffect(() => {
    const handle = (session) => {
      const next = session?.user ?? null;
      setUser(next);
      setAuthReady(true);
      if ((next?.id ?? null) === syncedFor.current) return; // token refresh etc.
      syncedFor.current = next?.id ?? null;
      resetAiMode();
      detectAiMode().then(setAiMode);
      if (next) {
        setSync("syncing");
        startSync(next)
          .then(() => setSync("synced"))
          .catch((e) => {
            console.warn("[InterviewX] Sync failed:", e?.message ?? e);
            setSync("error");
          });
      } else {
        stopSync();
        setSync("off");
      }
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer: Supabase recommends not awaiting other auth calls inside this callback.
      setTimeout(() => handle(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  const update = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);
  const setConfig = useCallback((c) => {
    setConfigState(c);
    try {
      sessionStorage.setItem("interviewx:config", JSON.stringify(c));
    } catch {
      /* ignore */
    }
  }, []);

  const signIn = useCallback(async () => {
    setAuthError("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result?.error)
      setAuthError(result.error.message || "Google sign-in didn't complete. Please try again.");
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <Ctx.Provider
      value={{
        settings,
        update,
        config,
        setConfig,
        aiMode,
        user,
        authReady,
        sync,
        signIn,
        signOut,
        authError,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
