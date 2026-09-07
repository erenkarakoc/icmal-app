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

// --- GitHub'dan gelen gercek bicim ------------------------------------------
// electron-updater notu release Atom feed'indeki <content type="html">
// elemanindan okur; GitHub orada Markdown'i HTML'e cevirmis olarak sunar.
// Asagidaki metin v1.0.20 feed'inden birebir alindi.

const GERCEK_FEED = `<h2>Yenilikler</h2>
<ul>
<li>R2 yetkisi Edge Function&#39;a tasindi</li>
<li>donemsel denetim, sessiz indirme ve surum notlari</li>
</ul>
<h2>Düzeltmeler</h2>
<ul>
<li>sunucu eylemi hatalari kullaniciya okunabilir gelsin</li>
</ul>`;

test('GitHub feed HTML bicimi kategorilere ve maddelere ayrilir', () => {
  const b = releaseNotlariniAyristir(GERCEK_FEED);
  assert.equal(b.length, 2);
  assert.equal(b[0].baslik, 'Yenilikler');
  assert.deepEqual(b[0].maddeler, [
    "R2 yetkisi Edge Function'a tasindi",
    'donemsel denetim, sessiz indirme ve surum notlari',
  ]);
  assert.equal(b[1].baslik, 'Düzeltmeler');
  assert.deepEqual(b[1].maddeler, ['sunucu eylemi hatalari kullaniciya okunabilir gelsin']);
});

test('HTML maddelerinde ham etiket sizmaz', () => {
  const b = releaseNotlariniAyristir('<ul><li>Bir <code>kod</code> ve <b>kalin</b></li></ul>');
  assert.equal(b[0].maddeler[0], 'Bir kod ve kalin');
  assert.equal(/[<>]/.test(b[0].maddeler[0]), false);
});

test('ic ice kacislar dogru cozulur', () => {
  const b = releaseNotlariniAyristir('<ul><li>&amp;lt; aynen kalmali</li></ul>');
  assert.equal(b[0].maddeler[0], '&lt; aynen kalmali');
});

test('basliksiz HTML listesi de maddelenir', () => {
  const b = releaseNotlariniAyristir('<ul><li>Tek madde</li></ul>');
  assert.equal(b[0].baslik, null);
  assert.deepEqual(b[0].maddeler, ['Tek madde']);
});

test('listesiz HTML govde kaybolmaz', () => {
  const b = releaseNotlariniAyristir('<p>Bu surumde bazi iyilestirmeler yapildi.</p>');
  assert.deepEqual(b[0].maddeler, ['Bu surumde bazi iyilestirmeler yapildi.']);
});

test('Markdown yolu bozulmadi', () => {
  // release.yml hala Markdown yaziyor; genel saglayiciya gecilirse o gelir.
  const b = releaseNotlariniAyristir('## Yenilikler\n- Madde');
  assert.equal(b[0].baslik, 'Yenilikler');
  assert.deepEqual(b[0].maddeler, ['Madde']);
});
