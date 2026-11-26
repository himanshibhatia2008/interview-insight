- [x] Create account-owned data tables, access rules, legacy import, reset, and AI quota.
      Tables/RLS/quota by Lovable (drizzle migration); client sync, one-time import of browser data on first sign-in, and account reset in `src/interviewx/lib/cloud.js`.
- [x] Add Google sign-in, account-aware navigation/profile defaults.
      Sign-in is optional: signed-out visitors use the labelled Demo mode with browser-only progress; signing in unlocks AI and saves progress to the account. Profile is prefilled from Google.
- [x] Replace Express AI with a protected Cloud function and preserve Demo fallback.
      Frontend calls `supabase.functions.invoke("ai")` (`src/interviewx/lib/api.js`).
- [x] Remove Express dependencies/server and verify the app.
      Restored the TanStack Start template; InterviewX lives in `src/interviewx/` and renders client-only from `src/routes/index.tsx`.
- [ ] Confirm Google sign-in is enabled in Cloud auth settings and test signed-in AI + sync in the Lovable preview.
