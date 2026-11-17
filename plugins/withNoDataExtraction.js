// allowBackup=false does not stop Android 12+ device-to-device transfer: these rules exclude every app file from
// both cloud backup and transfer, so warranties, receipts and the lock never leave the phone that way.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
const excludeAll = DOMAINS.map((d) => `    <exclude domain="${d}" path="." />`).join('\n');
const XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${excludeAll}
  </cloud-backup>
  <device-transfer>
${excludeAll}
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withNoDataExtraction(config) {
  config = withAndroidManifest(config, (c) => {
    AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults).$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return c;
  });
  return withDangerousMod(config, [
    'android',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'data_extraction_rules.xml'), XML);
      return c;
    },
  ]);
};
