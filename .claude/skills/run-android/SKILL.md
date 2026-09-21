---
name: run-android
description: Build, install, launch, and drive the Weekly Planner Android app (Capacitor shell around public/index.html) on an emulator. Use when asked to run the app, start the Android app, build the APK, take a screenshot of the app, or interact with the running app.
---

This is a Capacitor app: a React+Firebase web page (`public/index.html`,
the sole source file — there is no separate root copy) bundled into a
native Android shell (`android/`). It is driven via `adb` — no custom
test framework needed. All commands below use the driver script at
`.claude/skills/run-android/driver.sh`, run from the repo root.

## Prerequisites

macOS with Android SDK + an AVD already installed (this machine has
`Medium_Phone_API_36.0`, `Pixel_7`, `Pixel_9`, `flutter_emulator` —
use `Pixel_9` unless told otherwise). Java (JDK) must be on PATH for
Gradle. The driver auto-detects the SDK dir from `$ANDROID_SDK_ROOT` /
`$ANDROID_HOME` / `android/local.properties`, falling back to
`~/Library/Android/sdk`.

## Build

Only needed after editing the web code (`public/index.html`) or native
code. Editing `public/index.html` requires a Capacitor sync first so
the bundled Android assets pick up the change:

```bash
.claude/skills/run-android/driver.sh sync    # npx cap sync android
.claude/skills/run-android/driver.sh build   # ./gradlew assembleDebug
```

APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Run (agent path)

```bash
.claude/skills/run-android/driver.sh boot Pixel_9   # no-op if an emulator is already running
.claude/skills/run-android/driver.sh install        # builds first if no APK exists yet
.claude/skills/run-android/driver.sh launch
.claude/skills/run-android/driver.sh screenshot /tmp/app.png
```

Then look at `/tmp/app.png` (Read tool) to confirm it actually
rendered — a blank `#root` means the fallback error banner is showing
instead of the app.

| command | what it does |
|---|---|
| `boot [avd]` | Boots the AVD if none is running, blocks until `sys.boot_completed=1`. Default AVD: `Pixel_9`. |
| `sync` | `npx cap sync android` — pushes web changes into the native shell. |
| `build` | `./gradlew assembleDebug` (tries `--offline` first, falls back online). |
| `install` | `adb install -r` the debug APK; builds first if missing. |
| `launch` | `am start`s `MainActivity`, polls `mCurrentFocus` (up to 15s) to confirm it's foreground, then waits 3s more for the WebView's JS to paint (see Gotchas). |
| `screenshot <path>` | `adb exec-out screencap -p` to a local PNG. |
| `tap <x> <y>` | `adb shell input tap` — device pixel coords (screenshot is full-res, e.g. 1080x2424 on Pixel_9). |
| `text "<string>"` | `adb shell input text` — **ASCII only**, see Gotchas. |
| `logcat` | Tails `chromium`/`Capacitor` log tags (Ctrl-C to stop). |
| `stop` | Kills the emulator. |

Example drive-through (used to verify this skill): boot → install →
launch → screenshot → tap the "화" (Tuesday) day-tab at device coords
`(251, 803)` on a Pixel_9 → screenshot again → tab selection visibly
moved from Monday to Tuesday and the card below updated to "화요일
9.8".

## Run (human path)

Open Android Studio, select the `android/` project, pick a device in
the toolbar, hit Run. Only worth it for interactive debugging with
breakpoints.

## Test

No Android instrumentation/unit tests exist in this project as of this
writing — `android/app/src/test` and `src/androidTest` are just the
Capacitor scaffold defaults. The web code has no test suite either.
"Testing" this app means driving it as above and reading the
screenshot.

---

## Gotchas

- **`adb shell input text` can't type Hangul.** It only sends ASCII
  key events. The app's UI and to-do text are Korean, so you can't
  fully exercise "add a to-do" via the text command — tapping and
  reading screenshots covers navigation/state, but typing Korean
  content needs a real IME (out of scope for this driver).
- **`am start` focus check is flaky with a fixed sleep.** Right after
  `am start` fires, `dumpsys window | grep mCurrentFocus` can
  transiently print `mCurrentFocus=null` — sometimes it settles in
  under 1s, sometimes it takes several seconds (observed up to ~4s,
  no clear pattern tied to install vs. warm relaunch). A fixed
  `sleep 4` was tried first and still saw `null`. The driver's
  `launch` subcommand instead polls (1s interval, 15s timeout) until
  `mCurrentFocus` contains the app ID, and prints a `WARNING` to
  stderr if it never does — don't replace this with a fixed sleep.
- **A "페이지를 불러오지 못했어요" (failed to load) banner can appear
  *underneath* a fully-rendered, working UI.** `index.html` installs a
  `window.addEventListener("error", ...)` handler that shows a
  Korean fallback message on *any* uncaught JS error or if `#root` is
  still empty after 4s — but it doesn't hide itself if the error fires
  late, after the UI already rendered. Seeing this banner alongside a
  populated UI is not a driver problem or a real load failure; it
  means some non-fatal script error fired after initial render (in
  this app, most likely one of the CDN Firebase/React scripts). Only
  treat it as a real failure if `#root` itself is empty in the
  screenshot.
- **Foreground focus ≠ rendered UI.** `mCurrentFocus` reports the
  native Activity+WebView as soon as they exist — well before the
  CDN-loaded React/Babel/Firebase scripts inside the WebView have run
  and painted anything. A screenshot taken the instant focus is
  confirmed can come back completely blank (just the status bar) even
  though the app "launched successfully." Reproduced directly:
  screenshotting right after the focus-poll returned true → blank;
  the same screenshot 3s later → fully rendered UI. `launch` now
  sleeps 3s after confirming focus specifically to cover this — don't
  screenshot immediately after a hand-rolled `am start` without a
  similar wait.
- **A 3rd, in-between state exists: shell rendered but data still
  loading.** Even after the 3s wait, a screenshot can show the header
  and empty progress ring with the day list still saying "불러오는
  중..." (loading) instead of the day cards — React has mounted but
  the Firestore fetch (network-dependent) hasn't resolved yet. It's a
  normal transient state, not a driver bug. If you need the
  fully-populated view, take a second screenshot 2-3s after the
  first rather than tuning `launch`'s fixed sleep higher — this delay
  is network-bound, not fixed.
- **Re-launching an already-foregrounded app is a no-op with a
  warning.** `am start` on the running instance prints `Warning:
  Activity not started, intent has been delivered to currently
  running top-most instance.` — harmless, the focus check below it
  still confirms the app is up.

## Troubleshooting

- **`adb: command not found`**: the driver adds `platform-tools` and
  `emulator` to `PATH` itself; if running `adb`/`emulator` directly
  outside the driver, `export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools:$HOME/Library/Android/sdk/emulator"` first.
- **`./gradlew assembleDebug --offline` fails on a clean checkout**:
  the offline Gradle cache only has what's already been downloaded.
  The driver's `build` subcommand automatically retries without
  `--offline` if the offline attempt fails.
- **`adb install` fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`**:
  a differently-signed APK is already on the device/emulator. Uninstall
  first: `adb uninstall com.wwscj.weeklyplanner`.
