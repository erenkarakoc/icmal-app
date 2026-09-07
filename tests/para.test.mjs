import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  satirTutari,
  kalemlerToplami,
  kurusaYuvarla,
  gorunumDegeri,
} from '../src/shared/lib/para.ts';

const D = (v) => new Decimal(v);

// --- Kartin kabul senaryolari (TEMEL-05 · K-10 Soru 26) ----------------------

test('3 x 12,3456 satir tutari 37,04 TL olur', () => {
  // 37,0368 -> kurusa yuvarlanir.
  assert.equal(satirTutari(D(3), D('12.3456')).toFixed(2), '37.04');
});

test('yarim kurus sifirdan uzaga yuvarlanir, iki yonde de', () => {
  assert.equal(satirTutari(D(1), D('0.005')).toFixed(2), '0.01');
  assert.equal(satirTutari(D(1), D('-0.005')).toFixed(2), '-0.01');
});

test('iki ayri 0,005 TL kalem 0,02 TL toplam verir', () => {
  // Sozlesmenin can alici noktasi: toplam YUVARLANMIS satirlardan uretilir.
  // Yuvarlanmamis carpimlar toplanip sonunda yuvarlansaydi 0,01 cikardi.
  const a = satirTutari(D(1), D('0.005'));
  const b = satirTutari(D(1), D('0.005'));
  assert.equal(kalemlerToplami([a, b]).toFixed(2), '0.02');
});

test('toplam, yuvarlanmamis satir gelse bile sozlesmeyi uygular', () => {
  // Cagiran yerin dikkatsizligi toplama sizmamali.
  assert.equal(kalemlerToplami([D('0.005'), D('0.005')]).toFixed(2), '0.02');
});

// --- Hassasiyetin korunmasi --------------------------------------------------

test('miktar ve birim fiyat yuvarlanmaz, yalniz sonuc yuvarlanir', () => {
  const miktar = D('1.23456789');
  const fiyat = D('9.87654321');
  satirTutari(miktar, fiyat);
  assert.equal(miktar.toString(), '1.23456789', 'girdi degismemeli');
  assert.equal(fiyat.toString(), '9.87654321', 'girdi degismemeli');
});

test('alti ondaliktan hassas deger gosterimde kisalir ama kaynak bozulmaz', () => {
  const deger = D('1.23456789');
  assert.equal(gorunumDegeri(deger).toString(), '1.234568');
  assert.equal(deger.toString(), '1.23456789', 'gosterim kaynagi degistirmez');
});

test('alti ondaliktan kisa deger gosterimde uzatilmaz', () => {
  assert.equal(gorunumDegeri(D('2.5')).toString(), '2.5');
});

// --- Sinir durumlar ----------------------------------------------------------

test('bos liste sifir verir, uydurma yapilmaz', () => {
  assert.equal(kalemlerToplami([]).toFixed(2), '0.00');
});

test('negatif tutar korunur, mutlak degere cevrilmez', () => {
  assert.equal(kalemlerToplami([D('-5.005'), D('2')]).toFixed(2), '-3.01');
});

test('sifir miktar sifir tutar verir', () => {
  assert.equal(satirTutari(D(0), D('1234.5678')).toFixed(2), '0.00');
});

test('kurusaYuvarla dis kaynakli tutari sozlesmeye sokar', () => {
  assert.equal(kurusaYuvarla(D('12.345')).toFixed(2), '12.35');
  assert.equal(kurusaYuvarla(D('-12.345')).toFixed(2), '-12.35');
});

test('buyuk tutarlarda hassasiyet kaybi olmaz', () => {
  // decimal.js varsayilan 20 anlamli basamak; kurus hassasiyeti korunmali.
  // 123456789 x 1234,565 = 152.415.430.711,785 -> yarim, sifirdan uzaga.
  const t = satirTutari(D('123456789'), D('1234.565'));
  assert.equal(t.toFixed(2), '152415430711.79');
});

test('genel Decimal ayari degisse bile yuvarlama kipi bozulmaz', () => {
  // ekap-crypto.ts surec genelinde Decimal.set cagiriyor; para hesabi buna
  // bagli olmamali.
  const onceki = Decimal.rounding;
  Decimal.set({ rounding: Decimal.ROUND_DOWN });
  try {
    assert.equal(satirTutari(D(1), D('0.005')).toFixed(2), '0.01');
    assert.equal(kalemlerToplami([D('0.005'), D('0.005')]).toFixed(2), '0.02');
  } finally {
    Decimal.set({ rounding: onceki });
  }
});
