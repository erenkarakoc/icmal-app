import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { giderleriHesapla, giderToplami, toplamMaliyet, GiderDongusuHatasi }
  from '../src/features/projects/lib/giderler.ts';

const KALEM = new Decimal(1000000);

// K-06 Soru 6'daki senaryonun kendisi.
const santiye = { id: 's1', ad: 'Şantiye kurulumu', tur: 'tutar', deger: '100000' };
const genel = (taban = []) => ({ id: 'g1', ad: 'Genel gider', tur: 'yuzde', deger: '10', tabanGiderleri: taban });

test('varsayilan tabanda genel gider yalniz kalem toplamindan hesaplanir', () => {
  const s = giderleriHesapla(KALEM, [santiye, genel()]);
  const gg = s.find(x => x.id === 'g1');
  assert.equal(gg.taban.toString(), '1000000', 'taban kalem toplami olmali');
  assert.equal(gg.tutar.toString(), '100000', 'genel gider 100.000 olmali');
  assert.equal(toplamMaliyet(KALEM, s).toString(), '1200000', 'toplam maliyet 1.200.000 olmali');
});

test('secilen gider tabana dahil edilince oran onun uzerinden de hesaplanir', () => {
  const s = giderleriHesapla(KALEM, [santiye, genel(['s1'])]);
  const gg = s.find(x => x.id === 'g1');
  assert.equal(gg.taban.toString(), '1100000', 'taban 1.100.000 olmali');
  assert.equal(gg.tutar.toString(), '110000', 'genel gider 110.000 olmali');
  assert.equal(toplamMaliyet(KALEM, s).toString(), '1210000', 'toplam maliyet 1.210.000 olmali');
});

test('sabit gider toplamda bir kez eklenir', () => {
  // Santiye hem kendi basina hem genel giderin tabaninda; toplama iki kez girmemeli.
  const s = giderleriHesapla(KALEM, [santiye, genel(['s1'])]);
  assert.equal(giderToplami(s).toString(), '210000', 'giderler 100.000 + 110.000 olmali');
});

test('satir sirasi degisince sonuc degismez', () => {
  const duz = giderleriHesapla(KALEM, [santiye, genel(['s1'])]);
  const ters = giderleriHesapla(KALEM, [genel(['s1']), santiye]);
  assert.equal(toplamMaliyet(KALEM, duz).toString(), toplamMaliyet(KALEM, ters).toString());
  assert.equal(
    ters.find(x => x.id === 'g1').tutar.toString(), '110000',
    'bagimli gider once gelse de dogru hesaplanmali',
  );
});

test('zincirli taban dogru cozulur', () => {
  // a: sabit 100.000 | b: %10, tabani a | c: %10, tabani b
  const a = { id: 'a', ad: 'A', tur: 'tutar', deger: '100000' };
  const b = { id: 'b', ad: 'B', tur: 'yuzde', deger: '10', tabanGiderleri: ['a'] };
  const c = { id: 'c', ad: 'C', tur: 'yuzde', deger: '10', tabanGiderleri: ['b'] };
  const s = giderleriHesapla(KALEM, [c, b, a]);
  assert.equal(s.find(x => x.id === 'b').tutar.toString(), '110000', 'B = (1.000.000+100.000) * %10');
  assert.equal(s.find(x => x.id === 'c').tutar.toString(), '111000', 'C = (1.000.000+110.000) * %10');
});

test('kendini tabanina katan gider reddedilir', () => {
  const kendi = { id: 'x', ad: 'Kendine bagli', tur: 'yuzde', deger: '5', tabanGiderleri: ['x'] };
  assert.throws(() => giderleriHesapla(KALEM, [kendi]), GiderDongusuHatasi,
    'dogrudan dongu reddedilmeli');
});

test('dolayli dongu reddedilir ve zinciri bildirir', () => {
  const p = { id: 'p', ad: 'P', tur: 'yuzde', deger: '5', tabanGiderleri: ['q'] };
  const q = { id: 'q', ad: 'Q', tur: 'yuzde', deger: '5', tabanGiderleri: ['p'] };
  try {
    giderleriHesapla(KALEM, [p, q]);
    assert.fail('dolayli dongu reddedilmeliydi');
  } catch (e) {
    assert.ok(e instanceof GiderDongusuHatasi, 'GiderDongusuHatasi bekleniyordu');
    assert.ok(e.message.includes('P') && e.message.includes('Q'), 'hata zinciri iki gideri de anmali');
  }
});

test('sabit giderin tabanGiderleri yok sayilir', () => {
  // Sabit tutar orana bagli degildir; taban secimi onu degistirmemeli.
  const sabit = { id: 't', ad: 'Sabit', tur: 'tutar', deger: '50000', tabanGiderleri: ['s1'] };
  const s = giderleriHesapla(KALEM, [santiye, sabit]);
  assert.equal(s.find(x => x.id === 't').tutar.toString(), '50000');
});

test('gider yoksa toplam maliyet kalem toplamidir', () => {
  const s = giderleriHesapla(KALEM, []);
  assert.equal(giderToplami(s).toString(), '0');
  assert.equal(toplamMaliyet(KALEM, s).toString(), '1000000');
});

test('ondalikli oran tam duyarlikla hesaplanir', () => {
  const s = giderleriHesapla(new Decimal('1234.56'), [
    { id: 'o', ad: 'Oran', tur: 'yuzde', deger: '7.5' },
  ]);
  // 1234.56 * 0.075 = 92.592 — kayan nokta yuvarlamasi olmamali
  assert.equal(s[0].tutar.toString(), '92.592');
});

test('bulunmayan taban gideri acik hata verir', () => {
  const kayip = { id: 'k', ad: 'Kayip tabanli', tur: 'yuzde', deger: '5', tabanGiderleri: ['yok'] };
  assert.throws(() => giderleriHesapla(KALEM, [kayip]), /Gider bulunamadı/);
});
