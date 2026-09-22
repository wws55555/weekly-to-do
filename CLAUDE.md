# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page Korean-language weekly to-do list ("위클리 플래너"), shared/live between whoever opens it (no per-user accounts — one anonymous Firebase identity, one shared Firestore dataset). It's used purely as an Android app via a Capacitor shell — there is no web hosting/deployment target (Firebase Hosting was intentionally removed; `firebase.json` has no `hosting` config, only Firebase Auth + Firestore are used).

## Source of truth: `public/`

The whole app is a handful of plain files under `public/` — no bundler, no npm build step, no JSX precompilation anywhere. React, ReactDOM, and Babel Standalone come from CDN `<script>` tags in `index.html`; everything else is loaded as separate `<script>` tags in a fixed order (see `index.html`), sharing one global scope like any classic multi-script page (no ES modules, no `import`/`export`):

- `index.html` — just the `<head>`/CDN tags/script-loading skeleton; no app logic.
- `styles.css` — all CSS (page shell + the `.wk-*` design system).
- `dateUtils.js` — pure date/label helpers (`getMonday`, `addDays`, `toKey`, `formatMD`, `isSameDay`, `uid`, `DAY_LABELS*`). Plain JS, no Babel needed.
- `firestoreApi.js` — the *only* file that talks to Firebase. Exposes `WeeklyPlannerAPI` (`firebaseReady`, `watchAuth`, `watchWeek`, `writeWeek`, `runCarryOverFromPrevWeek`) as plain functions; knows nothing about React.
- `useWeeklyTasks.js` — a custom hook holding all state, effects, and the carry-over decision logic. Calls into `WeeklyPlannerAPI` for persistence, calls into `dateUtils.js` for date math, and returns a plain object of state + actions. Plain JS (hooks are just function calls; no JSX here), so no Babel needed either.
- `icons.jsx`, `WeeklyPlanner.jsx` — JSX, so these load via `<script type="text/babel" src="...">` and get compiled in-browser. `WeeklyPlanner.jsx` is pure UI: it calls `useWeeklyTasks()` and renders — no Firestore calls or carry-over logic live in it.

Because there's no module system, load order in `index.html` **is** the dependency graph — `dateUtils.js` → `firestoreApi.js` → `useWeeklyTasks.js` → `icons.jsx` → `WeeklyPlanner.jsx`. Get that order wrong and things fail with "X is not defined" at runtime, not a build error. For the same reason, don't add a second `const { useState, ... } = React` destructure in another file — it's already done once in `useWeeklyTasks.js`; a second top-level `const` with the same name in another classic script is a `SyntaxError` (they share one script-level scope). Reference `React.useX` directly instead if a component-level file needs a hook (see `WeeklyPlanner.jsx`'s `React.useState` for `inputText`).

Everything here lives under `public/` (rather than the repo root) only because that's Capacitor's `webDir` (see `capacitor.config.json`) — the folder `npx cap sync`/`copy` copies wholesale into the native Android project. There is no other copy anywhere and no sync step between files — edit files under `public/` directly.

## Commands

There is no build, lint, or test tooling in this repo — `package.json` has no `scripts` block, and there's no test framework or CI config. "Testing" a change means running the app and looking at it.

- **Preview in a browser**: serve `public/` (e.g. `cd public && python3 -m http.server`) and open `index.html`. It talks to a live Firebase project, so it needs network access.
- **Run/build/inspect the Android app**: use the `run-android` skill (`.claude/skills/run-android/driver.sh`), which drives the whole cycle via `adb`/Gradle — `sync` (Capacitor sync), `build` (assembleDebug), `boot`, `install`, `launch`, `screenshot`, `tap`, `text`, `logcat`, `stop`. Run `driver.sh sync` before `driver.sh build` whenever anything under `public/` changed. See the skill's own docs for known gotchas (adb can't type Hangul, focus-vs-rendered timing, an emulator stylus-tutorial overlay, etc.).
- `android/` is a generated Capacitor project — treat it as build output, not hand-written source; native changes go through `npx cap sync android`, not manual edits to `android/app/src/main/assets`.

## Architecture

- **Data model**: Firestore, one document per calendar week at `weeklyPlanner/{weekKey}`, where `weekKey` is that week's Monday as `YYYY-MM-DD` (`toKey(getMonday(date))`). Each doc holds a single `tasks` array covering all 7 days — there is no one-doc-per-task structure. A task looks like:
  ```js
  { id, day, text, done, important, createdAt, carriedOver?, forwarded?, originDate? }
  ```
  `day` is an **index 0–6 (Mon–Sun) within that week's document**, not an absolute date — the same weekday index means something different in every week's doc.
- **Writes are whole-array overwrites**: `persist(next)` (in `useWeeklyTasks.js`) does an optimistic local `setTasks(next)` then calls `WeeklyPlannerAPI.writeWeek(weekKey, next)` (in `firestoreApi.js`), which `.set()`s the whole `tasks` array on the current week's doc. There's no per-task Firestore write path; every mutation (add/toggle/delete) recomputes the full array client-side and rewrites it wholesale.
- **Reads are a live subscription** to only the currently-viewed week's doc (`onSnapshot`, keyed by `weekKey` + `authUid`); switching weeks (`weekOffset`) re-subscribes.
- **Auth** is anonymous Firebase Auth, one identity shared by the whole UI — there's no concept of "my tasks" vs "someone else's."
- **Carry-over**: incomplete tasks left on a past day get copied forward to today automatically (not moved) — the original stays put and is flagged `forwarded: true` so it isn't copied again, while a new independent task (`carriedOver: true`) appears on today, cascading forward day by day until completed. Same-week carry-over is a plain client-side recompute + `persist()`; carrying over from *last* week's doc into this week's doc is a Firestore `runTransaction` (reads both docs, writes both) since it spans two documents. Only one week back is checked, not the full history. Each copy carries an `originDate` (`M.D` string, from `formatMD`) inherited from its source and shown as a badge next to the task text — it's set once from the *first* task in the chain and passed through unchanged on every subsequent cascade, so it always reflects the original registration date, not the most recent carry date. Copies created before this field existed have no `originDate` and just render without a badge (`{t.carriedOver && t.originDate && ...}`) rather than showing one blank.
- **Date/week helpers** (`getMonday`, `addDays`, `toKey`, `formatMD`, `isSameDay`) underpin all of the above — read these first when touching anything date-related.
- All user-facing strings are Korean; match the existing tone/phrasing when adding UI text.
