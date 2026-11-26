# Interview Studio: sign-in, AI, and saved progress

## What will change

- Replace the Express AI server with one authenticated Lovable Cloud function. It will preserve the current question, evaluation, summary, and resume prompts and schemas; use the OpenRouter key from a secure project secret; retain Demo AI fallback; and enforce a 40-call daily limit per account.
- Add Google-only sign-in to the existing hash-based app. Keep the home page public, require sign-in elsewhere, return people to the page they requested, show their Google identity in navigation, and prefill an empty profile.
- Move profile, interview history, activities, roadmap progress, resume analysis, and daily challenge data into account-owned database records with row-level access rules. Keep the current synchronous storage helpers backed by an in-memory cache, import old browser data once on first sign-in, keep settings local, and make “Reset all my data” delete only that account’s saved records.
- Remove Express and the requested unused packages, simplify the development command to Vite, and leave the existing page designs intact.

## How it will be checked

- Exercise the signed-out route guard and protected AI-function response; confirm the existing Demo fallback remains available when AI is not configured.
- Check database access rules and the 40-call quota behavior, then verify a signed-in practice interview and its saved result when credentials are available.
- Run the project’s available checks and inspect the preview for regressions.

## Setup that needs your input

- I’ll request the OpenRouter key through the secure secret form after this plan is approved. If you choose the built-in AI option instead, I’ll switch the AI provider before requesting a key.
- Google sign-in will use the Cloud Google provider. The Cloud auth settings will show the callback URL to add to your Google web client; your Google client ID and secret belong in those settings, not in app code.
