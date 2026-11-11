import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TFunction } from 'i18next';
import { claimEmail, mailtoUrl } from './claim.ts';

// Echo keys and interpolated values, enough to check structure without i18next.
const t = ((key: string, opts?: Record<string, string>) => (opts ? `${key}(${Object.values(opts).join(',')})` : key)) as unknown as TFunction;

test('claim email lists the purchase details and skips empty ones', () => {
  const { subject, body } = claimEmail(t, { product: 'Kettle', purchaseDate: 'Jan 15, 2026', endDate: 'Jan 15, 2029', orderNumber: null, serialNumber: 'SN-1', name: 'Elek' });
  assert.equal(subject, 'claim.subject(Kettle)');
  assert.ok(body.includes('claim.product: Kettle\nclaim.purchaseDate: Jan 15, 2026\nclaim.serialNumber: SN-1\nclaim.validUntil: Jan 15, 2029'));
  assert.ok(!body.includes('claim.orderNumber'));
  assert.ok(body.endsWith('claim.thanks\nElek'));
});

test('mailto encodes subject and body', () => {
  assert.equal(mailtoUrl('a@b.hu', 'Garancia: ő & ű', 'Sor 1\nSor 2'), 'mailto:a%40b.hu?subject=Garancia%3A%20%C5%91%20%26%20%C5%B1&body=Sor%201%0ASor%202');
});
