import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  araToplam,
  metrajToplami,
  eklenenToplam,
  minhaToplam,
  mahallereGore,
} from '../src/features/projects/lib/metraj.ts';

const D = (v) => (v === null ? null : new Decimal(v));
const satir = (o = {}) => ({
  id: o.id ?? 's1',
  mahal: o.mahal ?? '',
  minha: o.minha ?? false,
  adet: D(o.adet ?? null),
  boy: D(o.boy ?? null),
  en: D(o.en ?? null),
  yukseklik: D(o.yukseklik ?? null),
});

// --- Ara toplam --------------------------------------------------------------

test('bos alan carpima girmez, 1 sayilmaz', () => {
  // m² olcusu: yalniz en ve boy dolu.
  assert.equal(araToplam(satir({ boy: '5', en: '3' })).toString(), '15');
});

test('uc olcu m³ verir', () => {
  assert.equal(araToplam(satir({ boy: '5', en: '3', yukseklik: '2' })).toString(), '30');
});

test('adet ile birlikte carpilir', () => {
  assert.equal(araToplam(satir({ adet: '4', boy: '5', en: '3' })).toString(), '60');
});

test('yalniz adet girilirse adet kadar olur', () => {
  assert.equal(araToplam(satir({ adet: '7' })).toString(), '7');
});

test('hicbir olcu yoksa sifir; miktar uydurulmaz', () => {
  assert.equal(araToplam(satir()).toString(), '0');
});

test('ara toplam minhadan etkilenmez, hep pozitif okunur', () => {
  assert.equal(araToplam(satir({ boy: '2', en: '3', minha: true })).toString(), '6');
});

test('ondalikli olculer tam hassasiyette kalir', () => {
  // Miktar PARA DEGILDIR; kurusa yuvarlanmaz (K-10).
  assert.equal(araToplam(satir({ boy: '1.005', en: '2.5' })).toString(), '2.5125');
});

// --- Toplam ------------------------------------------------------------------

test('minha isaretli satir toplamdan dusulur', () => {
  const s = [
    satir({ id: 'a', mahal: 'Salon', boy: '10', en: '5' }),
    satir({ id: 'b', mahal: 'Salon', boy: '2', en: '1', minha: true }),
  ];
  assert.equal(metrajToplami(s).toString(), '48');
  assert.equal(eklenenToplam(s).toString(), '50');
  assert.equal(minhaToplam(s).toString(), '2', 'minha toplami pozitif okunur');
});

test('dusulenler eklenenleri asarsa negatif kalir, sessizce sifirlanmaz', () => {
  const s = [
    satir({ id: 'a', boy: '1', en: '1' }),
    satir({ id: 'b', boy: '5', en: '5', minha: true }),
  ];
  assert.equal(metrajToplami(s).toString(), '-24');
});

test('bos liste sifir verir', () => {
  assert.equal(metrajToplami([]).toString(), '0');
});

test('satir sirasi sonucu degistirmez', () => {
  const a = satir({ id: 'a', boy: '3', en: '4' });
  const b = satir({ id: 'b', boy: '1', en: '2', minha: true });
  assert.equal(metrajToplami([a, b]).toString(), metrajToplami([b, a]).toString());
});

// --- Mahal -------------------------------------------------------------------

test('ayni mahal toplanir, tek poz iki mahalde kullanilabilir', () => {
  // Kartin dogrulama senaryosu: tek pozun iki mahalde kullanilmasi.
  const s = [
    satir({ id: 'a', mahal: 'Zemin kat', boy: '10', en: '5' }),
    satir({ id: 'b', mahal: 'Birinci kat', boy: '10', en: '4' }),
    satir({ id: 'c', mahal: 'Zemin kat', boy: '2', en: '1' }),
  ];
  const g = mahallereGore(s);
  assert.deepEqual(
    g.map((x) => [x.mahal, x.toplam.toString()]),
    [
      ['Zemin kat', '52'],
      ['Birinci kat', '40'],
    ],
  );
  assert.equal(metrajToplami(s).toString(), '92');
});

test('mahal adindaki bosluk kirpilir, ayni mahal bolunmez', () => {
  const s = [
    satir({ id: 'a', mahal: ' Salon ', boy: '1', en: '1' }),
    satir({ id: 'b', mahal: 'Salon', boy: '2', en: '1' }),
  ];
  assert.equal(mahallereGore(s).length, 1);
});

test('mahal bazli toplamda minha dusulur', () => {
  const s = [
    satir({ id: 'a', mahal: 'Salon', boy: '10', en: '5' }),
    satir({ id: 'b', mahal: 'Salon', boy: '2', en: '1', minha: true }),
  ];
  assert.equal(mahallereGore(s)[0].toplam.toString(), '48');
});
