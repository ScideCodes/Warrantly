import assert from 'node:assert/strict';
import { test } from 'node:test';
import { springAt } from './spring.ts';

const bouncy = { stiffness: 157.9, damping: 17.6, mass: 1 }; // SwiftUI .bouncy: duration .5, bounce .3
const sheet = { stiffness: 520, damping: 46, mass: 1 }; // damping ratio 1.01: React Native's critical branch

for (const [name, c] of [['underdamped', bouncy], ['critically damped', sheet]] as const) {
  test(`${name}: starts at from with v, ends at rest on to, velocity is the derivative`, () => {
    const s0 = springAt(c, 300, 0, -1200, 0);
    assert.ok(Math.abs(s0.x - 300) < 1e-9);
    assert.ok(Math.abs(s0.v + 1200) < 1e-9);
    const end = springAt(c, 300, 0, -1200, 5);
    assert.ok(Math.abs(end.x) < 1e-3 && Math.abs(end.v) < 1e-2);
    for (const t of [0.02, 0.08, 0.2]) {
      const h = 1e-6;
      const slope = (springAt(c, 300, 0, -1200, t + h).x - springAt(c, 300, 0, -1200, t - h).x) / (2 * h);
      assert.ok(Math.abs(slope - springAt(c, 300, 0, -1200, t).v) < 1e-3, `t=${t}`);
    }
  });
}
