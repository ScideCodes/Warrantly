// Android app icon shortcuts (long-press the icon): "Add warranty" and "Scan receipt", as deep links
// into Expo Router. Static shortcuts need no library: an XML file plus one meta-data line.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const SHORTCUTS = [
  { id: 'add', url: 'warrantly://warranty/edit', label: { en: 'Add warranty', hu: 'Garancia hozzáadása' } },
  { id: 'scan', url: 'warrantly://warranty/edit?scan=1', label: { en: 'Scan receipt', hu: 'Nyugta beolvasása' } },
];

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'");

function shortcutsXml(pkg) {
  const items = SHORTCUTS.map(
    (s) => `  <shortcut android:shortcutId="${s.id}" android:enabled="true" android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/shortcut_${s.id}" android:shortcutLongLabel="@string/shortcut_${s.id}">
    <intent android:action="android.intent.action.VIEW" android:targetPackage="${pkg}" android:targetClass="${pkg}.MainActivity" android:data="${s.url.replace(/&/g, '&amp;')}" />
  </shortcut>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>\n<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">\n${items.join('\n')}\n</shortcuts>\n`;
}

const stringsXml = (lang) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${SHORTCUTS.map((s) => `  <string name="shortcut_${s.id}">${escape(s.label[lang])}</string>`).join('\n')}\n</resources>\n`;

module.exports = function withShortcuts(config) {
  config = withAndroidManifest(config, (c) => {
    const activity = c.modResults.manifest.application[0].activity.find((a) => a.$['android:name'] === '.MainActivity');
    activity['meta-data'] = (activity['meta-data'] ?? []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts');
    activity['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } });
    return c;
  });
  return withDangerousMod(config, [
    'android',
    (c) => {
      const res = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res');
      const write = (dir, file, text) => {
        fs.mkdirSync(path.join(res, dir), { recursive: true });
        fs.writeFileSync(path.join(res, dir, file), text);
      };
      write('xml', 'shortcuts.xml', shortcutsXml(c.android.package));
      write('values', 'shortcut_strings.xml', stringsXml('en'));
      write('values-hu', 'shortcut_strings.xml', stringsXml('hu'));
      return c;
    },
  ]);
};
