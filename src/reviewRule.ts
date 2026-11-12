// When to ask for a store rating (section 13): only once the app has proved useful (10 opens, 3 warranties),
// and at most every 120 days. The store decides whether its dialog really appears.
export function shouldAskReview(opens: number, warranties: number, lastAsk: string | null, now = new Date()): boolean {
  if (opens < 10 || warranties < 3) return false;
  return !lastAsk || now.getTime() - new Date(lastAsk).getTime() > 120 * 86_400_000;
}
