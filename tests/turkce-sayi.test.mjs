import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  parseTurkishNumber,
  formatTurkishNumber,
  formatTurkishExact,
} from '../src/shared/lib/turkish-number.ts';

const D = (v) => new Decimal(v);

test('duzenleme alanindan gecis hassasiyeti bozmaz', () => {
  // Asil hata buydu: hucre 2 ondalikla gosteriliyor, onBlur o metni geri
  // yaziyordu. Hucreye girip cikmak bile 12,3456'yi 12,35 yapiyordu.
  const kaynak = D('12.3456');
  const gidisDonus = parseTurkishNumber(formatTurkishExact(kaynak));
  assert.equal(gidisDonus.toString(), '12.3456');
});

test('alti ondaliktan hassas deger de gidis-donuste korunur', () => {
  const kaynak = D('1234.12345678');
  assert.equal(parseTurkishNumber(formatTurkishExact(kaynak)).toString(), '1234.12345678');
});

test('binlik ayraci gidis-donuste kaybolmaz', () => {
  const kaynak = D('1234567.891');
  assert.equal(formatTurkishExact(kaynak), '1.234.567,891');
  assert.equal(parseTurkishNumber('1.234.567,891').toString(), '1234567.891');
});

test('negatif deger ve binlik ayraci birlikte dogru', () => {
  assert.equal(formatTurkishExact(D('-1234567.5')), '-1.234.567,5');
  assert.equal(parseTurkishNumber('-1.234.567,5').toString(), '-1234567.5');
});

test('tam sayida ondalik uydurulmaz', () => {
  assert.equal(formatTurkishExact(D('1000')), '1.000');
  assert.equal(formatTurkishExact(D('0')), '0');
});

test('formatTurkishNumber para gosterimi icin 2 ondalikta kalir', () => {
  // Tutar gosterimi kasitli olarak kurusa iner; degisen sey duzenleme alani.
  assert.equal(formatTurkishNumber(D('1234.5678')), '1.234,57');
  assert.equal(formatTurkishNumber(D('-1234.5')), '-1.234,50');
});

test('bos ve gecersiz girdi sifir verir, patlamaz', () => {
  assert.equal(parseTurkishNumber('').toString(), '0');
  assert.equal(parseTurkishNumber('   ').toString(), '0');
});
