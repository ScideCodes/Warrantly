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

# Share into Warrantly (#3): a PDF sent from another app opens the add form with it attached.
ID=$(adb shell content query --uri content://media/external/file --projection _id --where "_display_name=\'fixture-share.pdf\'" | sed -n 's/.*_id=\([0-9]*\).*/\1/p' | head -1)
adb shell am start -a android.intent.action.SEND -t application/pdf --eu android.intent.extra.STREAM "content://media/external/file/$ID" --grant-read-uri-permission -n "$APP/.MainActivity"
sleep 8; adb exec-out screencap -p > out/after-share-intent.png
flow share

# App icon shortcuts (#21): published by the app, and the link they use opens the add form.
adb shell dumpsys shortcut | grep -A3 "$APP" | grep -qE "add|scan"; result $? "shortcuts-published"
adb shell dumpsys shortcut | grep -E "shortcutId|Static|$APP" | head -20 > out/shortcuts.txt
adb shell am start -a android.intent.action.VIEW -d "warrantly://warranty/edit" "$APP"
flow shortcut

flow cleanup
adb logcat -d -b crash > out/crash.txt
adb logcat -d > out/logcat.txt
cp -r ~/.maestro/tests out/maestro-tests 2>/dev/null
find "$PWD" "$HOME/.maestro" -name '*.png' -newer app.apk -not -path '*/out/*' -exec cp {} out/ \; 2>/dev/null
ls -R out | head -80
grep -q "$APP" out/crash.txt; [ $? = 0 ] && { echo "FAIL app crashed (see crash.txt)"; FAILED=1; } || echo "PASS no crashes"
exit $FAILED
