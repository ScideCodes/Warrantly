// shortcut: placeholder palette until the design pass; screens read colors only from here.
export const colors = {
  background: '#FFFFFF',
  text: '#111827',
  muted: '#4B5563', // 7.6:1 on white
  border: '#6B7280', // 4.8:1, input borders need 3:1
  primary: '#1D4ED8', // 6.7:1 with white text
  primaryDisabled: '#93A5D8',
  onPrimary: '#FFFFFF',
  // Days-left pills: dark text on a light tint, each pair above 4.5:1.
  ok: { fg: '#166534', bg: '#DCFCE7' },
  warning: { fg: '#92400E', bg: '#FEF3C7' },
  soon: { fg: '#991B1B', bg: '#FEE2E2' },
  expired: { fg: '#374151', bg: '#F3F4F6' },
  banner: '#FEF3C7',
} as const;
