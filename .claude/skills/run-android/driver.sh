#!/usr/bin/env bash
# Driver for launching and driving the Weekly Planner Android app
# (Capacitor shell around public/index.html) on an emulator via adb.
#
# Usage:
#   driver.sh boot [avd-name]        # boot emulator if none running, wait for full boot
#   driver.sh sync                   # npx cap sync android (after editing index.html)
#   driver.sh build                  # ./gradlew assembleDebug
#   driver.sh install                # install the debug APK (build first if missing)
#   driver.sh launch                 # am start the MainActivity
#   driver.sh screenshot <out.png>   # screencap to a local file
#   driver.sh tap <x> <y>            # input tap at device pixel coords
#   driver.sh text "<string>"        # input text (ASCII only; adb can't type Hangul)
#   driver.sh logcat                 # tail app logs (Capacitor/Console tags), Ctrl-C to stop
#   driver.sh stop                   # kill the emulator
#
# All commands must be run with CWD = repo root (weekly-To-Do/).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ANDROID_DIR="$REPO_ROOT/android"
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
APP_ID="com.wwscj.weeklyplanner"
ACTIVITY=".MainActivity"
DEFAULT_AVD="Pixel_9"

# Resolve Android SDK dir: env var, else what's recorded in local.properties, else default.
if [ -n "${ANDROID_SDK_ROOT:-}" ]; then
  SDK_DIR="$ANDROID_SDK_ROOT"
elif [ -n "${ANDROID_HOME:-}" ]; then
  SDK_DIR="$ANDROID_HOME"
elif [ -f "$ANDROID_DIR/local.properties" ]; then
  SDK_DIR="$(sed -n 's/^sdk.dir=//p' "$ANDROID_DIR/local.properties" | tail -1)"
else
  SDK_DIR="$HOME/Library/Android/sdk"
fi

export PATH="$PATH:$SDK_DIR/platform-tools:$SDK_DIR/emulator"

cmd="${1:-}"
shift || true

case "$cmd" in
  boot)
    avd="${1:-$DEFAULT_AVD}"
    if adb devices | grep -q "^emulator-.*device$"; then
      echo "Emulator already running."
    else
      nohup emulator -avd "$avd" -no-snapshot-save > /tmp/android-emulator.log 2>&1 &
      disown
      echo "Booting $avd (pid $!)..."
    fi
    adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
      sleep 2
    done
    echo "Boot complete."
    ;;

  sync)
    (cd "$REPO_ROOT" && npx cap sync android)
    ;;

  build)
    (cd "$ANDROID_DIR" && ./gradlew assembleDebug --offline || ./gradlew assembleDebug)
    ;;

  install)
    if [ ! -f "$APK_PATH" ]; then
      echo "No APK found, building first..."
      (cd "$ANDROID_DIR" && ./gradlew assembleDebug --offline || ./gradlew assembleDebug)
    fi
    adb install -r "$APK_PATH"
    ;;

  launch)
    adb shell am start -n "$APP_ID/$ACTIVITY"
    focus=""
    for _ in $(seq 1 15); do
      focus="$(adb shell dumpsys window | grep mCurrentFocus || true)"
      case "$focus" in *"$APP_ID"*) break ;; esac
      sleep 1
    done
    echo "$focus"
    case "$focus" in
      *"$APP_ID"*)
        # Foreground focus lands as soon as the Activity+WebView exist,
        # well before the CDN-loaded React/Firebase JS inside it has
        # painted anything. Give it a beat so a screenshot taken right
        # after `launch` isn't just a blank #root.
        sleep 3
        ;;
      *) echo "WARNING: app did not come to foreground within 15s" >&2 ;;
    esac
    ;;

  screenshot)
    out="${1:?usage: driver.sh screenshot <out.png>}"
    adb exec-out screencap -p > "$out"
    echo "Saved $out"
    ;;

  tap)
    x="${1:?x}"; y="${2:?y}"
    adb shell input tap "$x" "$y"
    ;;

  text)
    str="${1:?usage: driver.sh text \"<string>\"}"
    adb shell input text "$str"
    ;;

  logcat)
    adb logcat -s "chromium:I" "Capacitor:I" "Capacitor/Console:I"
    ;;

  stop)
    adb -e emu kill || true
    ;;

  *)
    echo "Unknown or missing command: $cmd" >&2
    sed -n '2,20p' "$0" >&2
    exit 1
    ;;
esac
