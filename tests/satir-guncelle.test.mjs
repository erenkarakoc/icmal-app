import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  satiriGuncelle,
  kaynakFiyatinaDon,
  cozulmusKaynak,
} from '../src/shared/lib/satir-guncelle.ts';

const D = (v) => new Decimal(v);
const kaynak = { priceAmount: '123.45' };
const satir = (ek = {}) => ({
  pozNo: '15.100',
  quantity: D(2),
  unitPrice: D('123.45'),
  total: D('246.90'),
  fromDatabase: true,
  source: kaynak,
  fiyatKaynagi: 'katalog',
  ...ek,
});

test('katalogdan secim fiyat kaynagini kataloga cevirir', () => {
  const y = satiriGuncelle(
    satir({ source: undefined, fiyatKaynagi: 'elle', fromDatabase: false }),
    {
      pozNo: '15.100',
      unitPrice: D('123.45'),
      source: kaynak,
      fromDatabase: true,
    },
  );
  assert.equal(y.fiyatKaynagi, 'katalog');
});

test('fiyat elle degistirilince kaynak KORUNUR ama satir elle isaretlenir', () => {
  // Asil kusur buydu: kaynak duruyordu, isaret yoktu; dosyada resmi fiyat
  // 123,45 yazarken satirda 200 kullaniliyordu.
  const y = satiriGuncelle(satir(), { unitPrice: D(200) });
  assert.equal(y.fiyatKaynagi, 'elle');
  assert.equal(y.source, kaynak, 'katalog anlik goruntusu silinmemeli');
  assert.equal(y.unitPrice.toString(), '200', 'hesapta kullanicinin fiyati kullanilir');
  assert.equal(y.total.toFixed(2), '400.00');
});

test('poz numarasi elle degisince katalog izi silinir', () => {
  const y = satiriGuncelle(satir(), { pozNo: '99.999' });
  assert.equal(y.source, undefined);
  assert.equal(y.fromDatabase, false);
  assert.equal(y.fiyatKaynagi, 'elle');
});

test('miktar degisimi fiyat kaynagini degistirmez', () => {
  const y = satiriGuncelle(satir(), { quantity: D(3) });
  assert.equal(y.fiyatKaynagi, 'katalog');
  assert.equal(y.total.toFixed(2), '370.35');
});

test('tutar K-10 sozlesmesinden gecer', () => {
  const y = satiriGuncelle(satir(), { quantity: D(3), unitPrice: D('12.3456') });
  assert.equal(y.total.toFixed(2), '37.04');
});

test('kaynak fiyatina donus acik secimle olur', () => {
  const elle = satiriGuncelle(satir(), { unitPrice: D(200) });
  const geri = kaynakFiyatinaDon(elle);
  assert.equal(geri.unitPrice.toString(), '123.45');
  assert.equal(geri.fiyatKaynagi, 'katalog');
  assert.equal(geri.total.toFixed(2), '246.90');
});

test('kaynagi olmayan satirda donus bir sey bozmaz', () => {
  const yalin = satir({ source: undefined, fiyatKaynagi: 'elle' });
  assert.equal(kaynakFiyatinaDon(yalin), yalin);
});

test('hicbir guncelleme kendiliginden kaynak fiyata donmez', () => {
  const elle = satiriGuncelle(satir(), { unitPrice: D(200) });
  const sonra = satiriGuncelle(elle, { quantity: D(5) });
  assert.equal(sonra.unitPrice.toString(), '200');
  assert.equal(sonra.fiyatKaynagi, 'elle');
});

test('eski dosyada alan yoksa kaynak varligindan cozulur', () => {
  assert.equal(cozulmusKaynak({ ...satir(), fiyatKaynagi: undefined }), 'katalog');
  assert.equal(cozulmusKaynak({ ...satir(), fiyatKaynagi: undefined, source: undefined }), 'elle');
});
