// Spring physics (pure: no React Native, tested in Node).
export type SpringConfig = { stiffness: number; damping: number; mass: number };

// Position and velocity, `t` seconds in, of a spring that started at `from` with velocity `v` (units/s) toward
// `to`. The same closed form as React Native's native spring (SpringAnimation.kt), including its choice to treat
// an overdamped spring as critically damped, so the result matches what the UI thread is drawing.
export function springAt(c: SpringConfig, from: number, to: number, v: number, t: number): { x: number; v: number } {
  const w0 = Math.sqrt(c.stiffness / c.mass);
  const zeta = c.damping / (2 * Math.sqrt(c.stiffness * c.mass));
  const x0 = to - from;
  const v0 = -v;
  if (zeta < 1) {
    const w1 = w0 * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * w0 * t);
    const a = (v0 + zeta * w0 * x0) / w1;
    const sin = Math.sin(w1 * t);
    const cos = Math.cos(w1 * t);
    return { x: to - e * (a * sin + x0 * cos), v: zeta * w0 * e * (a * sin + x0 * cos) - e * (cos * (v0 + zeta * w0 * x0) - w1 * x0 * sin) };
  }
  const e = Math.exp(-w0 * t);
  return { x: to - e * (x0 + (v0 + w0 * x0) * t), v: e * (v0 * (t * w0 - 1) + t * x0 * w0 * w0) };
}
