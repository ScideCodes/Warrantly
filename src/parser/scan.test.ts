import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findDate, parseScanText } from './scan.ts';

test('findDate reads common receipt formats and ignores future dates', () => {
  const today = '2026-11-11';
  assert.equal(findDate('Kelt: 2026.01.15. 14:32', today), '2026-01-15');
  assert.equal(findDate('Dátum: 2026. 03. 02.', today), '2026-03-02');
  assert.equal(findDate('Date 15/01/2026', today), '2026-01-15');
  assert.equal(findDate('Order date: Jan 15, 2026', today), '2026-01-15');
  assert.equal(findDate('Teljesítés: 2026. márc. 4.', today), '2026-03-04');
  assert.equal(findDate('Garancia vége: 2029.01.15  Vásárlás: 2026.01.15', today), '2026-01-15'); // future skipped
  assert.equal(findDate('Tel: 06 1 234 5678', today), null);
  assert.equal(findDate('Kelt: 15.01.2026  Fizetési határidő: 2026.01.23', today), '2026-01-15'); // first in the text, whatever the format
});

test('purchase dates beat mail timestamps and payment deadlines', () => {
  assert.equal(findDate('2026-11-10\nPayment due: 2026-11-08\nPurchase date: 2026-10-21', '2026-11-11'), '2026-10-21');
  assert.equal(findDate('Fizetési határidő: 2026.11.09.\nVásárlás dátuma: 2026.10.20.', '2026-11-11'), '2026-10-20');
  assert.equal(findDate('Warranty expires: 2026-10-01\nPurchased on: September 15, 2025', '2026-11-11'), '2025-09-15');
  assert.equal(findDate('Payment due: 2026-11-08', '2026-11-11'), null);
  assert.equal(findDate('Vásárlás: 2026. szeptember 15.', '2026-11-11'), '2026-09-15');
});

test('autofill rejects impossible dates and accepts real leap days', () => {
  assert.equal(findDate('2026-02-31\n2026-04-31', '2026-11-11'), null);
  assert.equal(findDate('2024-02-29', '2026-11-11'), '2024-02-29');
  assert.equal(findDate('2025-02-29', '2026-11-11'), null);
});

// Synthetic OCR text shaped like a Hungarian shop receipt with a warranty line.
const receipt = `MEDIAMARKT
MediaMarkt Budapest Árkád
1106 Budapest, Örs vezér tere 25.
Adószám: 12345678-2-42
NYUGTA
Philips vízforraló HD9350 1 db 19 990 Ft
Kiszállítás 1 db 0 Ft
Jótállás: 3 év
Bizonylatszám: 0001/2026
Rendelésszám: 2026-778899
2026.01.15. 14:32`;

test('parseScanText suggests store, product, date, warranty and order number', () => {
  assert.deepEqual(parseScanText(receipt, '2026-11-11'), {
    storeName: 'MEDIAMARKT',
    productName: 'Philips vízforraló HD9350',
    purchaseDate: '2026-01-15',
    warrantyStartDate: null,
    warrantyMonths: 36,
    orderNumber: '2026-778899',
    price: 19990,
    currency: 'HUF',
    serialNumber: 'HD9350',
    serialNumbers: ['HD9350'],
  });
});

test('parseScanText leaves unknown fields empty', () => {
  assert.deepEqual(parseScanText('Köszönjük a vásárlást!', '2026-11-11'), {
    storeName: 'Köszönjük a vásárlást!',
    productName: null,
    purchaseDate: null,
    warrantyStartDate: null,
    warrantyMonths: null,
    orderNumber: null,
    price: null,
    currency: null,
    serialNumber: null,
    serialNumbers: [],
  });
});

test('parseScanText identifies warranty start, serial number and price from warranty PDF', () => {
  const pdfInvoice = `ALZA.HU
Számla és jótállási jegy
Számlaszám: 2026-INV-9988
Vásárlás dátuma: 2026.02.10
Beüzemelés dátuma: 2026.02.12
Apple MacBook Air M3 1 db 499 990 Ft
S/N: C02G1234MD6R
Jótállás: 24 hó
Fizetendő végösszeg: 499 990 Ft`;
  const result = parseScanText(pdfInvoice, '2026-11-11');
  assert.equal(result.storeName, 'ALZA.HU');
  assert.equal(result.productName, 'Apple MacBook Air M3');
  assert.equal(result.purchaseDate, '2026-02-10');
  assert.equal(result.warrantyStartDate, '2026-02-12');
  assert.equal(result.warrantyMonths, 24);
  assert.equal(result.serialNumber, 'C02G1234MD6R');
  assert.equal(result.price, 499990);
  assert.equal(result.currency, 'HUF');
});

test('scanning a mixed-warranty receipt does not give the first product the second guarantee', () => {
  const result = parseScanText('Acme Store\n1 × Acme Mouse\nAcme Kettle | 12 months warranty', '2026-11-11');
  assert.equal(result.productName, 'Acme Mouse');
  assert.equal(result.warrantyMonths, null);
});
