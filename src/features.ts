import { getSetting, setSetting } from '@/settings';
import { useEffect, useState } from 'react';

// Release switches. Gmail import needs Google's verification of the restricted gmail.readonly scope;
// until then it stays hidden and no sign-in asks for it. The code is kept for when it is approved.
// A staging build turns it on with EXPO_PUBLIC_GMAIL_IMPORT=1 (for example to record Google's demo video);
// release builds never set it.
//
// A hidden developer toggle (7 taps on the version row in Settings) enables local storage
// flag 'gmail_import_enabled', allowing developer/private testing on production builds.

const listeners = new Set<(enabled: boolean) => void>();

export function isGmailImportEnabled(): boolean {
  if (process.env.EXPO_PUBLIC_GMAIL_IMPORT === '1') return true;
  try {
    return getSetting('gmail_import_enabled') === '1';
  } catch {
    return false;
  }
}

export let GMAIL_IMPORT = isGmailImportEnabled();

export function setGmailImportEnabled(on: boolean): void {
  try {
    setSetting('gmail_import_enabled', on ? '1' : '0');
  } catch {}
  GMAIL_IMPORT = isGmailImportEnabled();
  listeners.forEach((l) => l(GMAIL_IMPORT));
}

export function useGmailImport(): boolean {
  const [enabled, setEnabled] = useState(isGmailImportEnabled);
  useEffect(() => {
    const l = (val: boolean) => setEnabled(val);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return enabled;
}
