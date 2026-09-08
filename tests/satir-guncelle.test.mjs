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

// --- PROJE-02 · metraj bagi --------------------------------------------------

import { metrajiUygula } from '../src/shared/lib/satir-guncelle.ts';

test('metraj eklenince miktar ondan gelir', () => {
  const y = metrajiUygula(satir({ quantity: D(2), elleMiktar: D(2) }), [{ minha: false }], D(48));
  assert.equal(y.quantity.toString(), '48');
  assert.equal(y.total.toFixed(2), '5925.60', 'tutar yeni miktarla yeniden hesaplanir');
});

test('metraj kaldirilinca kullanicinin elle degeri geri gelir', () => {
  // Metraj eklemek kullanicinin girdigi sayiyi kaybettirmemeli.
  const elle = satiriGuncelle(satir(), { quantity: D(7) });
  assert.equal(elle.elleMiktar.toString(), '7');
  const metrajli = metrajiUygula(elle, [{ minha: false }], D(48));
  assert.equal(metrajli.quantity.toString(), '48');
  const geri = metrajiUygula(metrajli, [], D(0));
  assert.equal(geri.quantity.toString(), '7', 'elle deger geri gelmeli');
});

test('metraj varken miktar guncellemesi elle degeri bozmaz', () => {
  const metrajli = metrajiUygula(satir({ elleMiktar: D(7) }), [{ minha: false }], D(48));
  const sonra = satiriGuncelle(metrajli, { quantity: D(99) });
  assert.equal(sonra.elleMiktar.toString(), '7', 'saklanan elle deger korunur');
});

test('elle deger hic girilmemisse metraj kalkinca sifir olur, uydurma yok', () => {
  const metrajli = metrajiUygula(satir({ elleMiktar: undefined }), [{ minha: false }], D(48));
  assert.equal(metrajiUygula(metrajli, [], D(0)).quantity.toString(), '0');
});
