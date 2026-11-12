import { Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import Storage from 'expo-sqlite/kv-store';
import { shouldAskReview } from './reviewRule.ts';

// Called on every home-screen open; shows Google Play's in-app rating dialog when the rule says so.
export async function maybeAskReview(warranties: number): Promise<void> {
  const opens = Number(Storage.getItemSync('open_count') ?? 0) + 1;
  Storage.setItemSync('open_count', String(opens));
  if (!shouldAskReview(opens, warranties, Storage.getItemSync('review_asked_at'))) return;
  if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
  Storage.setItemSync('review_asked_at', new Date().toISOString());
  await StoreReview.requestReview();
}

// "Rate Warrantly" in Settings: the store page.
export const openStorePage = (): Promise<void> => Linking.openURL(StoreReview.storeUrl() ?? 'market://details?id=dev.warrantly.prototype');
