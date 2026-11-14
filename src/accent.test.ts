import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCENTS, accentColors, contrast, validAccent } from './accent.ts';
import { createThemeStore } from './themeStore.ts';
test('accent presets and extreme custom colors remain readable in both themes', () => {
  for (const color of [...Object.keys(ACCENTS), '#FFFFFF', '#000000', '#FFFF00', '#FF00FF', '#123456']) for (const dark of [false, true]) {
    const c = accentColors(color, dark);
    assert.ok(contrast(c.accent, c.onAccent) >= 4.5, color);
    assert.ok(contrast(c.tintInk, dark ? '#2c2c2e' : '#f2f2f7') >= 4.5, color);
    assert.ok(contrast(c.tintInk, c.tintSoft) >= 4.5, color);
  }
  for (const bad of ['toString','red','#FFF','#GGGGGG','']) assert.equal(validAccent(bad), false);
  const store = createThemeStore(false);
  const before = store.colors.accent;
  assert.equal(store.set(false, 'purple'), true);
  assert.notEqual(store.colors.accent, before);
  const purple = store.colors.accent;
  store.set(true);
  assert.equal(store.colors.accent, purple);
  assert.equal(store.set(true), false);
  store.set(false, 'blue');
  assert.equal(store.colors.accent, before);
});
