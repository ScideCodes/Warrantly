import assert from 'node:assert/strict';
import { test } from 'node:test';
import en from './en.json' with { type: 'json' };
import hu from './hu.json' with { type: 'json' };

// Every language must have the same keys and the same {{placeholders}} as English.
function flatten(obj: object, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === 'object') Object.assign(acc, flatten(v, `${prefix}${k}.`));
    else acc[`${prefix}${k}`] = v;
    return acc;
  }, {});
}
const vars = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort();

for (const [name, lang] of Object.entries({ hu })) {
  test(`${name} matches English keys and placeholders`, () => {
    const base = flatten(en);
    const other = flatten(lang);
    assert.deepEqual(Object.keys(other).sort(), Object.keys(base).sort());
    for (const key of Object.keys(base)) assert.deepEqual(vars(other[key]), vars(base[key]), key);
  });
}
