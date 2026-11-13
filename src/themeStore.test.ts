import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createThemeStore, dark, light, resolveDark } from './themeStore.ts';

test('Auto follows the phone; Light and Dark override it', () => {
  assert.equal(resolveDark('system', 'dark'), true);
  assert.equal(resolveDark('system', 'light'), false);
  assert.equal(resolveDark('system', null), false); // unknown: light
  assert.equal(resolveDark('light', 'dark'), false);
  assert.equal(resolveDark('dark', 'light'), true);
});

test('switching updates the same colours object in place and notifies once', () => {
  const store = createThemeStore(false);
  const colors = store.colors;
  let calls = 0;
  const off = store.subscribe(() => calls++);
  assert.equal(colors.bg, light.bg);
  assert.equal(store.set(true), true);
  assert.equal(store.colors, colors); // identity kept: modules holding `colors` see the new values
  assert.deepEqual({ ...colors }, dark);
  assert.deepEqual(store.get(), { dark: true, version: 1 });
  assert.equal(calls, 1);
  assert.equal(store.set(true), false); // already dark: no re-render
  assert.equal(calls, 1);
  off();
  store.set(false);
  assert.equal(calls, 1);
  assert.deepEqual({ ...colors }, light);
  assert.equal(store.get().version, 2);
});

test('badge tones follow the scheme (no stale colours after repeated switches)', () => {
  const store = createThemeStore(true);
  const soon = store.tone.soon;
  assert.deepEqual(soon, { fg: dark.bad, bg: dark.badSoft });
  for (let i = 0; i < 5; i++) store.set(i % 2 === 0 ? false : true);
  assert.equal(store.tone.soon, soon);
  assert.deepEqual(store.tone.soon, { fg: light.bad, bg: light.badSoft });
  assert.deepEqual(store.tone.ok, { fg: light.ink2, bg: light.fill });
});
