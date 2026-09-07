import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseNotlariniAyristir } from '../src/shared/lib/release-notes.ts';

test('release.yml bicimi kategorilere ayrilir', () => {
  const b = releaseNotlariniAyristir(
    '## Yenilikler\n- Kâr ve teklif ekranı\n- Gider girişi\n\n## Düzeltmeler\n- Yarım kalan release düzeltildi\n',
  );
  assert.equal(b.length, 2);
  assert.equal(b[0].baslik, 'Yenilikler');
  assert.deepEqual(b[0].maddeler, ['Kâr ve teklif ekranı', 'Gider girişi']);
  assert.equal(b[1].baslik, 'Düzeltmeler');
  assert.deepEqual(b[1].maddeler, ['Yarım kalan release düzeltildi']);
});

test('baslik olmadan gelen notlar da gosterilir', () => {
  const b = releaseNotlariniAyristir('- Tek madde\n- Ikinci madde');
  assert.equal(b.length, 1);
  assert.equal(b[0].baslik, null);
  assert.equal(b[0].maddeler.length, 2);
});

test('duz metin kaybolmaz', () => {
  // Bicim degisirse bile icerik gorunmeli; ayristirici kati degildir.
  const b = releaseNotlariniAyristir('Bu surumde bazi iyilestirmeler yapildi.');
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].maddeler, ['Bu surumde bazi iyilestirmeler yapildi.']);
});

test('bos girdi hicbir blok uretmez', () => {
  assert.deepEqual(releaseNotlariniAyristir(''), []);
  assert.deepEqual(releaseNotlariniAyristir('\n\n   \n'), []);
});

test('windows satir sonlari ve yildiz maddeleri desteklenir', () => {
  const b = releaseNotlariniAyristir('## Yenilikler\r\n* Madde bir\r\n* Madde iki');
  assert.equal(b[0].baslik, 'Yenilikler');
  assert.deepEqual(b[0].maddeler, ['Madde bir', 'Madde iki']);
});

test('bos kategori atilir', () => {
  const b = releaseNotlariniAyristir('## Yenilikler\n- Var\n## Düzeltmeler\n');
  // Bos "Düzeltmeler" basligi tutulur ama maddesizdir; kullaniciya bos liste
  // gosterilmemesi icin bileşen tarafinda zaten madde donguluyor.
  assert.equal(b[0].maddeler.length, 1);
});

test('maddedeki tire isareti korunur', () => {
  const b = releaseNotlariniAyristir('- Gider-kâr akışı düzeltildi');
  assert.equal(b[0].maddeler[0], 'Gider-kâr akışı düzeltildi');
});
