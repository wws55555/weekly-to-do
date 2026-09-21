# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page Korean-language weekly to-do list ("위클리 플래너"), shared/live between whoever opens it (no per-user accounts — one anonymous Firebase identity, one shared Firestore dataset). It ships two ways from the same source: a Firebase-hosted web page, and an Android app via a Capacitor shell.

## Source of truth: `index.html`

The entire app — HTML, CSS, and a React 18 component tree written in JSX — lives in **one file**, `index.html`. There is no bundler, no npm build step, no JSX precompilation: React, ReactDOM, and Babel Standalone are loaded from CDN `<script>` tags, and the app's own code sits in a `<script type="text/babel">` block that Babel compiles in-browser on load.

**`public/index.html` is a generated copy, never edit it directly.** `firebase.json`'s `predeploy` hook (`cp index.html public/index.html`) is what normally keeps it in sync, but that only fires on `firebase deploy`. Since Capacitor's `webDir` is `public` (see `capacitor.config.json`), any change to `index.html` meant to be tested on Android must be copied over manually first:
```bash
cp index.html public/index.html
```

## Commands

There is no build, lint, or test tooling in this repo — `package.json` has no `scripts` block, and there's no test framework or CI config. "Testing" a change means running the app and looking at it.

- **Preview in a browser**: serve the repo root (e.g. `python3 -m http.server`) and open `index.html`. It talks to a live Firebase project, so it needs network access.
- **Deploy web**: `firebase deploy` (uses `.firebaserc` project `weekly-planner-5f03b`; the predeploy hook syncs `public/index.html` automatically).
- **Run/build/inspect the Android app**: use the `run-android` skill (`.claude/skills/run-android/driver.sh`), which drives the whole cycle via `adb`/Gradle — `sync` (Capacitor sync), `build` (assembleDebug), `boot`, `install`, `launch`, `screenshot`, `tap`, `text`, `logcat`, `stop`. Always `cp index.html public/index.html` and `driver.sh sync` before `driver.sh build` if `index.html` changed. See the skill's own docs for known gotchas (adb can't type Hangul, focus-vs-rendered timing, etc.).
- `android/` is a generated Capacitor project — treat it as build output, not hand-written source; native changes go through `npx cap sync android`, not manual edits to `android/app/src/main/assets`.

## Architecture inside `index.html`

- **Data model**: Firestore, one document per calendar week at `weeklyPlanner/{weekKey}`, where `weekKey` is that week's Monday as `YYYY-MM-DD` (`toKey(getMonday(date))`). Each doc holds a single `tasks` array covering all 7 days — there is no one-doc-per-task structure. A task looks like:
  ```js
  { id, day, text, done, important, createdAt, carriedOver?, forwarded? }
  ```
  `day` is an **index 0–6 (Mon–Sun) within that week's document**, not an absolute date — the same weekday index means something different in every week's doc.
- **Writes are whole-array overwrites**: `persist(next)` does an optimistic local `setTasks(next)` then `.set({ tasks: next, updatedAt: ... })` on the current week's doc. There's no per-task Firestore write path; every mutation (add/toggle/delete) recomputes the full array client-side and rewrites it wholesale.
- **Reads are a live subscription** to only the currently-viewed week's doc (`onSnapshot`, keyed by `weekKey` + `authUid`); switching weeks (`weekOffset`) re-subscribes.
- **Auth** is anonymous Firebase Auth, one identity shared by the whole UI — there's no concept of "my tasks" vs "someone else's."
- **Carry-over**: incomplete tasks left on a past day get copied forward to today automatically (not moved) — the original stays put and is flagged `forwarded: true` so it isn't copied again, while a new independent task (`carriedOver: true`) appears on today, cascading forward day by day until completed. Same-week carry-over is a plain client-side recompute + `persist()`; carrying over from *last* week's doc into this week's doc is a Firestore `runTransaction` (reads both docs, writes both) since it spans two documents. Only one week back is checked, not the full history.
- **Date/week helpers** (`getMonday`, `addDays`, `toKey`, `formatMD`, `isSameDay`) underpin all of the above — read these first when touching anything date-related.
- All user-facing strings are Korean; match the existing tone/phrasing when adding UI text.
