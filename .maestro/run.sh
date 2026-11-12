#!/bin/bash
# Runs inside the emulator job. Each step prints PASS/FAIL; screenshots go to out/.
set -u
mkdir -p out
APP=dev.warrantly.prototype
result() { if [ "$1" = 0 ]; then echo "PASS $2"; else echo "FAIL $2"; FAILED=1; fi; }
FAILED=0
adb install -r -g app.apk
adb logcat -c
adb logcat -v time ReactNativeJS:V ReactNative:V AndroidRuntime:E ExpoModulesCore:V expo-share-intent:V ExpoShareIntent:V '*:S' > out/applog.txt 2>&1 &
adb logcat -v time > out/fulllog.txt 2>&1 &
for f in fixture-invoice.pdf fixture-share.pdf fixture-shared.json; do adb push "$f" /sdcard/Download/; done
adb push fixture-photo.jpg /sdcard/Pictures/
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null
sleep 5

export MAESTRO_CLI_NO_ANALYTICS=1
flow() { (cd out && maestro test --format junit --output "$1.xml" --debug-output "debug-$1" --test-output-dir "tests-$1" "../.maestro/$1.yaml" > "$1.log" 2>&1); result $? "$1"; tail -5 "out/$1.log"; adb exec-out screencap -p > "out/end-$1.png"; }

flow main

# Share into Warrantly (#3), the way a person does it: Files app, long-press the PDF, Share, Warrantly.
adb shell am start -n com.google.android.documentsui/com.android.documentsui.files.FilesActivity
sleep 3
flow share

# App icon shortcuts (#21): published by the app, and the link they use opens the add form.
adb shell dumpsys shortcut | grep -A3 "$APP" | grep -qE "add|scan"; result $? "shortcuts-published"
adb shell dumpsys shortcut | grep -E "shortcutId|Static|$APP" | head -20 > out/shortcuts.txt
adb shell am start -a android.intent.action.VIEW -d "warrantly://warranty/edit" "$APP"
flow shortcut

flow cleanup
flow lock

# Fingerprint unlock on a cold start (user report: the prompt closed by itself). Needs a screen PIN and an
# enrolled finger; a background loop touches the emulator sensor so each prompt that stays open gets a finger.
adb shell svc power stayon true
adb shell settings put system screen_off_timeout 1800000
adb shell locksettings set-pin 1111
( while true; do adb -e emu finger touch 1 >/dev/null 2>&1; sleep 1.5; done ) & TOUCH=$!
adb shell am start -a android.settings.FINGERPRINT_ENROLL
flow fp-enroll
adb shell dumpsys fingerprint > out/fingerprint.txt 2>&1
flow fingerprint
kill $TOUCH
grep "fingerprint prompt closed" out/applog.txt out/logcat.txt 2>/dev/null | head
adb logcat -d -b crash > out/crash.txt
adb logcat -d > out/logcat.txt
cp -r ~/.maestro/tests out/maestro-tests 2>/dev/null
find "$PWD" "$HOME/.maestro" -name '*.png' -newer app.apk -not -path '*/out/*' -exec cp {} out/ \; 2>/dev/null
ls -R out | head -80
grep -q "$APP" out/crash.txt; [ $? = 0 ] && { echo "FAIL app crashed (see crash.txt)"; FAILED=1; } || echo "PASS no crashes"
exit $FAILED
