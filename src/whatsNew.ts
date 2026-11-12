import { getSeenWhatsNew, getUsername, setSeenWhatsNew } from '@/settings';

// "What's new" (section 13): shown once after an update that brought new notes. Change NOTES_ID together
// with the whatsNew.notes texts. A new install has nothing to compare with, so it skips straight past.
export const NOTES_ID = '2026-11-12';

export function shouldShowWhatsNew(): boolean {
  const seen = getSeenWhatsNew();
  if (seen === null && !getUsername()) {
    setSeenWhatsNew(NOTES_ID);
    return false;
  }
  return seen !== NOTES_ID;
}

export const markWhatsNewSeen = (): void => setSeenWhatsNew(NOTES_ID);
