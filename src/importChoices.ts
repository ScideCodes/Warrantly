import Storage from 'expo-sqlite/kv-store';
import { shopKey, type ShopChoices } from './importReview';

const key = (shop: string) => `import_choices:${shopKey(shop)}`;
export function readChoices(shop: string): ShopChoices {
  try {
    const value: unknown = JSON.parse(Storage.getItemSync(key(shop)) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v && typeof v === 'object' && typeof v.name === 'string' && v.name.length <= 500 && (v.months === undefined || /^(?:[1-9]|[1-9]\d|1[01]\d|120)$/.test(v.months))));
  } catch { return {}; }
}
export function rememberChoices(shop: string, choices: ShopChoices): void {
  // Bound storage: keep the latest 100 confirmed product mappings per shop.
  Storage.setItemSync(key(shop), JSON.stringify(Object.fromEntries(Object.entries({ ...readChoices(shop), ...choices }).slice(-100))));
}
export function forgetChoices(shop: string): void { Storage.removeItemSync(key(shop)); }
