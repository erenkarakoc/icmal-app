import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  gruplaraAyir,
  kullanilanDisiplinler,
  DISIPLINLER,
  GRUPSUZ_BASLIK,
} from '../src/features/projects/lib/is-gruplari.ts';

const s = (disiplin, isGrubu, tutar) => ({ disiplin, isGrubu, total: new Decimal(tutar) });

test('disiplin ve is grubu birlikte bolum olusturur', () => {
  const b = gruplaraAyir([
    s('İnşaat', 'Kaba Yapı', '100'),
    s('İnşaat', 'İnce Yapı', '50'),
    s('İnşaat', 'Kaba Yapı', '25'),
  ]);
  assert.equal(b.length, 2);
  assert.equal(b[0].baslik, 'İnşaat › Kaba Yapı');
  assert.equal(b[0].satirlar.length, 2);
  assert.equal(b[0].toplam.toFixed(2), '125.00');
  assert.equal(b[1].toplam.toFixed(2), '50.00');
});

test('bolum sirasi ilk gorulme sirasidir, alfabetik degil', () => {
  // Kullanicinin kurdugu duzen siralamayla bozulmamali.
  const b = gruplaraAyir([s('Mekanik', '', '10'), s('Elektrik', '', '20'), s('İnşaat', '', '30')]);
  assert.deepEqual(
    b.map((x) => x.baslik),
    ['Mekanik', 'Elektrik', 'İnşaat'],
  );
});

test('grupsuz satirlar kaybolmaz ve EN SONDA toplanir', () => {
  const b = gruplaraAyir([
    s(undefined, undefined, '5'),
    s('İnşaat', 'Kaba Yapı', '100'),
    s('', '', '7'),
  ]);
  assert.equal(b.at(-1).baslik, GRUPSUZ_BASLIK);
  assert.equal(b.at(-1).satirlar.length, 2, 'bos ve tanimsiz ayni bolume girer');
  assert.equal(b.at(-1).toplam.toFixed(2), '12.00');
});

test('yalniz disiplin varsa baslik disiplindir', () => {
  assert.equal(gruplaraAyir([s('Elektrik', '', '10')])[0].baslik, 'Elektrik');
});

test('yalniz is grubu varsa baslik is grubudur', () => {
  assert.equal(gruplaraAyir([s('', 'Çevre Düzenlemesi', '10')])[0].baslik, 'Çevre Düzenlemesi');
});

test('bosluk kirpilir, ayni grup bolunmez', () => {
  const b = gruplaraAyir([s(' İnşaat ', 'Kaba Yapı', '10'), s('İnşaat', ' Kaba Yapı', '10')]);
  assert.equal(b.length, 1);
});

test('bolum toplami K-10 sozlesmesinden gecer', () => {
  // Iki ayri 0,005 TL kalem 0,01 degil 0,02 TL toplam verir.
  const b = gruplaraAyir([s('İnşaat', '', '0.005'), s('İnşaat', '', '0.005')]);
  assert.equal(b[0].toplam.toFixed(2), '0.02');
});

test('bos liste bolum uretmez', () => {
  assert.deepEqual(gruplaraAyir([]), []);
});

test('hazir disiplinler ve projede kullanilanlar birlikte sunulur', () => {
  const d = kullanilanDisiplinler([s('Peyzaj', '', '1'), s('İnşaat', '', '1')]);
  assert.deepEqual(d, [...DISIPLINLER, 'Peyzaj']);
});

test('hazir disiplin tekrar eklenmez', () => {
  assert.deepEqual(kullanilanDisiplinler([s('Mekanik', '', '1')]), [...DISIPLINLER]);
});
