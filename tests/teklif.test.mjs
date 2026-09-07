import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { karHesapla, teklifiDagit, teklifBirimFiyati } from '../src/features/projects/lib/teklif.ts';

const D = (v) => new Decimal(v);

// --- K-06 Soru 7: kar ve teklif -------------------------------------------
test('maliyete oranla kar: 1.200.000 uzerine %10', () => {
  const s = karHesapla(D(1200000), { tur: 'oran', deger: '10' });
  assert.equal(s.kar.toString(), '120000');
  assert.equal(s.teklif.toString(), '1320000');
  assert.equal(s.zarar, null);
});

test('maliyete sabit kar: 150.000', () => {
  const s = karHesapla(D(1200000), { tur: 'sabit', deger: '150000' });
  assert.equal(s.kar.toString(), '150000');
  assert.equal(s.teklif.toString(), '1350000');
});

test('hedef teklif 1.350.000 iken kar 150.000', () => {
  const s = karHesapla(D(1200000), { tur: 'hedefTeklif', deger: '1350000' });
  assert.equal(s.kar.toString(), '150000');
  assert.equal(s.teklif.toString(), '1350000');
});

test('hedef teklif korunur, maliyet degisince kar degisir', () => {
  const s = karHesapla(D(1250000), { tur: 'hedefTeklif', deger: '1350000' });
  assert.equal(s.teklif.toString(), '1350000', 'hedef teklif korunmali');
  assert.equal(s.kar.toString(), '100000', 'kar 100.000 olmali');
});

test('maliyet hedefi asarsa zarar gosterilir', () => {
  const s = karHesapla(D(1400000), { tur: 'hedefTeklif', deger: '1350000' });
  assert.equal(s.zarar.toString(), '50000', '50.000 zarar');
  assert.equal(s.kar.toString(), '-50000', 'kar negatif olmali');
});

test('kar iki kez eklenmez: yontem tek secimdir', () => {
  // Ayni maliyete iki yontem ayri ayri uygulanir; sonuclar birbirine eklenmez.
  const oran = karHesapla(D(1000000), { tur: 'oran', deger: '10' });
  const sabit = karHesapla(D(1000000), { tur: 'sabit', deger: '100000' });
  assert.equal(oran.teklif.toString(), '1100000');
  assert.equal(sabit.teklif.toString(), '1100000');
});

// --- K-06 Soru 8: kalemlere dagitim ---------------------------------------
const kalemler = () => [
  { id: 'a', maliyet: D(600000) },
  { id: 'b', maliyet: D(400000) },
];

test('teklif maliyet paylarina gore dagitilir', () => {
  const s = teklifiDagit(kalemler(), D(1320000));
  assert.equal(s.satirlar.find(x => x.id === 'a').teklifTutari.toString(), '792000');
  assert.equal(s.satirlar.find(x => x.id === 'b').teklifTutari.toString(), '528000');
  assert.equal(s.fark.toString(), '0');
  assert.equal(s.uyari, null);
});

test('sabitlenen kalem korunur, kalan digerine dagitilir', () => {
  const s = teklifiDagit([
    { id: 'a', maliyet: D(600000), sabitTutar: D(800000) },
    { id: 'b', maliyet: D(400000) },
  ], D(1320000));
  assert.equal(s.satirlar.find(x => x.id === 'a').teklifTutari.toString(), '800000');
  assert.equal(s.satirlar.find(x => x.id === 'b').teklifTutari.toString(), '520000', 'ikinciye 520.000 kalmali');
  assert.equal(s.fark.toString(), '0');
});

test('dagitim maliyetleri ve toplam teklifi degistirmez', () => {
  const girdi = [
    { id: 'a', maliyet: D(600000), sabitTutar: D(800000) },
    { id: 'b', maliyet: D(400000) },
  ];
  const s = teklifiDagit(girdi, D(1320000));
  assert.equal(s.satirlar.find(x => x.id === 'a').maliyet.toString(), '600000');
  assert.equal(s.satirlar.find(x => x.id === 'b').maliyet.toString(), '400000');
  const toplam = s.satirlar.reduce((t, x) => t.plus(x.teklifTutari), D(0));
  assert.equal(toplam.toString(), '1320000', 'toplam teklif korunmali');
});

test('sabitler toplam teklifi asarsa fark bildirilir, sessizce duzeltilmez', () => {
  const s = teklifiDagit([
    { id: 'a', maliyet: D(600000), sabitTutar: D(1000000) },
    { id: 'b', maliyet: D(400000), sabitTutar: D(500000) },
  ], D(1320000));
  assert.ok(s.uyari, 'uyari verilmeli');
  assert.equal(s.fark.toString(), '-180000', 'asim bildirilmeli');
  assert.equal(s.satirlar.find(x => x.id === 'a').teklifTutari.toString(), '1000000',
    'sabit fiyat sessizce degistirilmemeli');
});

test('serbest kalem yokken kalan tutar varsa uyarilir', () => {
  const s = teklifiDagit([
    { id: 'a', maliyet: D(600000), sabitTutar: D(600000) },
  ], D(1320000));
  assert.ok(s.uyari, 'uyari verilmeli');
  assert.equal(s.fark.toString(), '720000');
});

test('serbest kalemlerin maliyeti sifirsa pay hesaplanamaz', () => {
  const s = teklifiDagit([
    { id: 'a', maliyet: D(0) },
    { id: 'b', maliyet: D(0) },
  ], D(1000));
  assert.ok(s.uyari, 'sifir agirlikta uyari verilmeli');
  assert.equal(s.fark.toString(), '1000');
});

test('sabit tutari toplama esitse serbest kaleme sifir dagitilir', () => {
  const s = teklifiDagit([
    { id: 'a', maliyet: D(600000), sabitTutar: D(1320000) },
    { id: 'b', maliyet: D(400000) },
  ], D(1320000));
  assert.equal(s.satirlar.find(x => x.id === 'b').teklifTutari.toString(), '0');
  assert.equal(s.uyari, null, 'kalan sifirsa uyari gerekmez');
});

test('teklif birim fiyati miktara bolunur, sifir miktarda tanimsizdir', () => {
  assert.equal(teklifBirimFiyati(D(792000), D(100)).toString(), '7920');
  assert.equal(teklifBirimFiyati(D(792000), D(0)), null);
});
