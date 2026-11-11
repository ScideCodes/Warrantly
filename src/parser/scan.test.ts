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
    warrantyMonths: 36,
    orderNumber: '2026-778899',
  });
});

test('parseScanText leaves unknown fields empty', () => {
  assert.deepEqual(parseScanText('Köszönjük a vásárlást!', '2026-11-11'), {
    storeName: 'Köszönjük a vásárlást!', productName: null, purchaseDate: null, warrantyMonths: null, orderNumber: null,
  });
});
