import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findDate, findPrice, parseScanText } from './scan.ts';

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
    storeName: null,
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

test('parseScanText skips mail greeting and extracts company from next-line Szállító and multi-word product', () => {
  const mailPdf = `Kedves Bence!
Köszönjük a megrendelést!
Rendelésszám: 2026-987654

Szállító:
Alza.cz a.s. Magyarországi Fióktelepe
1134 Budapest, Róbert Károly körút 54-58.
Adószám: 24738520-2-41

Vevő:
Kovács János
Budapest

Megnevezés
1 db Apple iPhone 15 Pro 128GB Fekete Titán
Jótállás: 36 hó garancia
Fizetendő összeg: 389 990 Ft
Dátum: 2026.03.15`;

  const result = parseScanText(mailPdf, '2026-11-11');
  assert.equal(result.storeName, 'Alza');
  assert.equal(result.productName, 'Apple iPhone 15 Pro 128GB Fekete Titán');
  assert.equal(result.warrantyMonths, 36);
  assert.equal(result.purchaseDate, '2026-03-15');
  assert.equal(result.orderNumber, '2026-987654');
  assert.equal(result.price, 389990);
  assert.equal(result.currency, 'HUF');
});

test('parseScanText detects company by legal form and numbered product line', () => {
  const invoice = `ELEKTRONIKUS SZÁMLA
Sorszám: INV-2026-0042
Extreme Digital-eMAG Kft.
1097 Budapest, Könyves Kálmán krt. 34.
Adószám: 10831696-2-44

1. Logitech MX Master 3S vezeték nélküli egér 1 db 39 990 Ft
Jótállási idő: 24 hónap
Végösszeg: 39 990 Ft
Kelt: 2026.04.10`;

  const result = parseScanText(invoice, '2026-11-11');
  assert.equal(result.storeName, 'Extreme Digital-eMAG Kft.');
  assert.equal(result.productName, 'Logitech MX Master 3S vezeték nélküli egér');
  assert.equal(result.warrantyMonths, 24);
  assert.equal(result.purchaseDate, '2026-04-10');
  assert.equal(result.price, 39990);
  assert.equal(result.currency, 'HUF');
});

test('parseScanText handles multi-space OCR tokens and seller anchor', () => {
  const ocrInvoice = `Invoice
Seller: Cyberport GmbH
Am Brauhaus 5, 01099 Dresden

Customer: John Doe
Date: 2026.05.20

Items:
Sony  WH-1000XM5  Noise  Canceling  Headphones 24 months warranty 1 pcs 349.00 EUR
Total: 349.00 EUR`;

  const result = parseScanText(ocrInvoice, '2026-11-11');
  assert.equal(result.storeName, 'Cyberport GmbH');
  assert.equal(result.productName, 'Sony WH-1000XM5 Noise Canceling Headphones');
  assert.equal(result.warrantyMonths, 24);
  assert.equal(result.purchaseDate, '2026-05-20');
  assert.equal(result.price, 349);
  assert.equal(result.currency, 'EUR');
});

// ReDoS guards: each 50 KB input made an old regex backtrack for seconds to minutes.
const hostile = (unit: string) => unit.repeat(Math.ceil(50_000 / unit.length));
function assertFast(label: string, run: () => unknown) {
  const start = performance.now();
  run();
  const ms = performance.now() - start;
  assert.ok(ms < 200, `${label} took ${ms.toFixed(0)} ms`);
}

test('scan regexes keep their matches and stay linear on hostile text', () => {
  assert.deepEqual(findPrice('Végösszeg: 12 990 Ft'), { price: 12990, currency: 'HUF' });
  assert.deepEqual(findPrice('Kettle 1 234 567 Ft'), { price: 1234567, currency: 'HUF' });
  assert.equal(parseScanText('Számlaszám: ABC-2026/123', '2026-11-11').orderNumber, 'ABC-2026/123');
  assert.equal(parseScanText('From: "Acme Shop" <a@acme.hu>', '2026-11-11').storeName, 'Acme Shop');
  assert.equal(parseScanText('Eladó: Acme   Kft, adószám: 1', '2026-11-11').storeName, 'Acme   Kft');
  const scan = (text: string) => () => parseScanText(text, '2026-11-11');
  assertFast('total line letters', scan(`Total ${hostile('a')}`));
  assertFast('digit run', () => findPrice(hostile('1')));
  assertFast('invoice number spaces', scan(`számlaszám${hostile(' ')}`));
  assertFast('From line spaces', scan(`From: a${hostile(' ')}b`));
  assertFast('seller name spaces', scan(`Eladó: a${hostile(' ')}b`));
});
