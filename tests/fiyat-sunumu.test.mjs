import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fiyatEtiketi,
  gosterilecekFiyat,
  birimEsit,
  farkliFiyatBirimi,
  dahilRozetleri,
} from '../src/shared/lib/fiyat-sunumu.ts';

const f = (tur, ek = {}) => ({ fiyat_turu: tur, tutar: 1, para_birimi_kodu: 'TRY', ...ek });

// --- Fiyat secimi ------------------------------------------------------------

test('birim fiyat varsa her zaman o secilir', () => {
  assert.equal(gosterilecekFiyat([f('rayic'), f('unit_price')]).fiyat_turu, 'unit_price');
});

test('birim fiyat yoksa rayic gosterilir, bosluk degil', () => {
  // Canli veride 5.563 poz surumu bu durumda; bugun kilit goruluyordu.
  assert.equal(gosterilecekFiyat([f('montage_price'), f('rayic')]).fiyat_turu, 'rayic');
});

test('hic fiyat yoksa null doner, uydurma yapilmaz', () => {
  assert.equal(gosterilecekFiyat([]), null);
  assert.equal(gosterilecekFiyat(null), null);
  assert.equal(gosterilecekFiyat(undefined), null);
});

test('siralamada olmayan tur kaybolmaz', () => {
  assert.equal(gosterilecekFiyat([f('bilinmeyen_tur')]).fiyat_turu, 'bilinmeyen_tur');
});

// --- Etiket ------------------------------------------------------------------

test('bilinen turler Turkce etiketlenir', () => {
  assert.equal(fiyatEtiketi('unit_price'), 'Birim fiyat');
  assert.equal(fiyatEtiketi('alternate_unit_price'), 'Alternatif birim');
});

test('bilinmeyen tur ham kod olarak gosterilir, ad uydurulmaz', () => {
  assert.equal(fiyatEtiketi('yeni_tur'), 'yeni_tur');
});

// --- Birim -------------------------------------------------------------------

test('birim karsilastirmasi yazim farkini yok sayar', () => {
  // Katalogda ad / Adet / AD / m² / M² bir arada.
  assert.equal(birimEsit('ad', 'AD'), true);
  assert.equal(birimEsit(' m² ', 'M²'), true);
});

test('farkli birimler ESIT SAYILMAZ, donusum yapilmaz', () => {
  assert.equal(birimEsit('m', 'ton'), false);
  assert.equal(farkliFiyatBirimi('m', 'ton'), 'm');
});

test('birim ayniysa tekrar gosterilmez', () => {
  assert.equal(farkliFiyatBirimi('Adet', 'adet'), null);
});

test('fiyatin kendi birimi yoksa uyusmazlik iddia edilmez', () => {
  // Canli veride fiyatlarin %45'inde birim bos; bu "farkli" demek degil.
  assert.equal(farkliFiyatBirimi(null, 'ton'), null);
  assert.equal(farkliFiyatBirimi('   ', 'ton'), null);
});

// --- Dahil/haric -------------------------------------------------------------

test('bilinen bayraklar rozete cevrilir', () => {
  assert.deepEqual(dahilRozetleri(f('unit_price', { kar_dahil_mi: true, kdv_dahil_mi: false })), [
    'kâr dahil',
    'KDV hariç',
  ]);
});

test('bilinmeyen bayrak HARIC diye sunulmaz', () => {
  assert.deepEqual(dahilRozetleri(f('unit_price', { kar_dahil_mi: null })), []);
  assert.deepEqual(dahilRozetleri(f('unit_price')), []);
});

test('genel giderler bayragi da gosterilir', () => {
  assert.deepEqual(dahilRozetleri(f('unit_price', { genel_giderler_dahil_mi: true })), [
    'genel giderler dahil',
  ]);
});
