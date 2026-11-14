import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currencyData } from './currencyData.ts';
import { currencyChoices, currencyFirst, currencyName, formatMoney, editingPrice, fractionDigits, priceDisplay, priceInput, priceNumber } from './money.ts';

test('complete offline currency list sorts localized names and keeps historical receipt codes', () => {
  for (const language of ['en', 'hu']) {
    const choices = currencyChoices(language, 'BGN');
    assert.ok(choices.length >= 170);
    assert.equal(new Set(choices.map(c => c.code)).size, choices.length);
    assert.ok(choices.some(c => c.code === 'HUF'));
    assert.ok(choices.some(c => c.code === 'XCG'));
    assert.ok(choices.some(c => c.code === 'ZWG'));
    assert.ok(choices.some(c => c.code === 'BGN'));
    for (let i = 1; i < choices.length; i++) assert.ok(choices[i - 1].name.localeCompare(choices[i].name, language) <= 0);
  }
  assert.equal(currencyName('HUF', 'hu'), 'magyar forint');
  assert.equal(fractionDigits('JPY'), 0);
  assert.equal(fractionDigits('KWD'), 3);
  assert.equal(fractionDigits('CLF'), 4);
  assert.ok(!('XXX' in currencyData));
});

test('price editing rejects non-numeric, negative, exponent, oversized and excess-precision inputs', () => {
  for (const value of ['abc', '-12', '12eur', '$12', '1e3', 'Infinity', '1.2.3', '1234567890123', '12.345']) assert.equal(priceInput(value, 'EUR', 'en'), null, value);
  assert.equal(priceInput('', 'EUR', 'en'), '');
  assert.equal(priceInput('1,234.50', 'USD', 'en'), '1234.50');
  assert.equal(priceInput('1\u00a0234,50', 'HUF', 'hu'), '1234.50');
  assert.equal(priceInput('1.234,50', 'EUR', 'hu'), '1234.50');
  assert.equal(priceInput('12,50', 'EUR', 'en'), '12.50');
  assert.equal(priceInput('12.50', 'EUR', 'hu'), '12.50');
  assert.equal(priceInput('0.', 'EUR', 'en'), '0.');
  assert.equal(priceInput('.5', 'EUR', 'en'), '0.5');
  assert.equal(priceInput('00012.00', 'EUR', 'en'), '12.00');
  assert.equal(priceInput('123.4', 'JPY', 'en'), null);
  assert.equal(priceInput('123.456', 'KWD', 'en'), '123.456');
});

test('display follows currency precision and language; saved value matches the formatted amount', () => {
  assert.equal(priceNumber('', 'USD'), null);
  assert.equal(priceNumber('-1', 'USD'), null);
  assert.equal(priceNumber('not a number', 'USD'), null);
  assert.equal(priceNumber('0', 'USD'), 0);
  assert.equal(priceNumber('12.345', 'USD'), 12.35);
  assert.equal(priceNumber('1234.5', 'JPY'), 1235);
  assert.equal(priceDisplay('1234.5', 'USD', 'en'), '1,234.50');
  assert.equal(priceDisplay('1234.5', 'HUF', 'hu').replace(/\s/g, ' '), '1 234,50');
  assert.equal(priceDisplay('1234', 'JPY', 'en'), '1,234');
  assert.equal(priceDisplay('12.3', 'KWD', 'en'), '12.300');
  assert.equal(editingPrice('1234.50', 'hu'), '1234,50');
  assert.equal(currencyFirst('en'), true);
  assert.equal(currencyFirst('hu'), false);
});

test('detail and total price labels retain the selected currency precision', () => {
  assert.ok(formatMoney(12.345, 'KWD', 'en').includes('12.345'));
  assert.ok(formatMoney(12.3456, 'CLF', 'en').includes('12.3456'));
  assert.ok(formatMoney(1234, 'JPY', 'en').includes('1,234'));
  assert.ok(!formatMoney(1234, 'JPY', 'en').includes('.00'));
  assert.ok(formatMoney(49.9, 'EUR', 'hu').startsWith('49,90'));
});
