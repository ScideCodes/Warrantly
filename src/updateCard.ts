// The home card for a downloaded app update. "Later" hides it for the rest of that day; the next day it shows
// again while the update still waits (the next cold start installs it anyway).
export function showUpdateCard(pending: boolean, laterDay: string | null, today: string): boolean {
  return pending && laterDay !== today;
}
