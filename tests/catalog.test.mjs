import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogEntries, escapeLike } from '../src/features/cost-estimate/lib/catalog.ts';
const base = { poz_surumu_id:'v1', poz_numarasi:'15.100.1001', tanim:'Test', kurum_kodu:'CSB', kitap_adi:'İnşaat', donem:'2026-01', birim:'m3', kaynak_url:'https://example.com/book.pdf', kaynak_sayfa:4 };
const price = { id:'p1', fiyat_turu:'unit_price', tutar:'12.3456789', para_birimi_kodu:'TRY', birim_ham:'m2' };
test('price unit and exact decimal snapshot survive selection', () => {
 const [row] = catalogEntries([{...base, fiyatlar:[price]}]);
 assert.equal(row.unit,'m2'); assert.equal(row.unitPrice.toString(),'12.3456789');
 assert.equal(row.source.versionId,'v1'); assert.equal(row.source.priceId,'p1'); assert.equal(row.source.page,4);
});
test('same poz across periods and alternative units remain distinct; duplicate query hits merge',()=>{
 const row={...base,fiyatlar:[price,{...price,id:'p2',birim_ham:'ton'}]};
 const entries=catalogEntries([row,row,{...row,poz_surumu_id:'v2',donem:'2026-02'}]);
 assert.equal(entries.length,4); assert.equal(new Set(entries.map(x=>x.key)).size,4);
});
test('zero and negative remain valid; unavailable or foreign prices are not fabricated',()=>{
 const entries=catalogEntries([{...base,fiyatlar:[{...price,tutar:'0'},{...price,tutar:'-5'},{...price,tutar:'NaN'},{...price,tutar:'Infinity'},{...price,para_birimi_kodu:'EUR'}]}, {...base,fiyatlar:null}]);
 assert.deepEqual(entries.map(x=>x.unitPrice.toString()),['0','-5']);
});
test('effective patched prices without a database id retain an explicit snapshot',()=>{
 const [row]=catalogEntries([{...base,fiyatlar:[{...price,id:null,birim_ham:null}]}]);
 assert.equal(row.unit,'m3');assert.equal(row.source.priceId,null);
});
test('malformed server rows fail rather than produce a misleading result',()=>{
 assert.throws(()=>catalogEntries([{poz_numarasi:'bad'}]));
 assert.equal(escapeLike('a%_'), 'a\\%\\_');
});

// --- TEMEL-04 · fiyatin kendi birimi ----------------------------------------

test('fiyat birimi poz birimînden farkliysa girdi isaretlenir', () => {
  // Canli veride 98 satir boyle: m birimli fiyat, ton birimli poz.
  const [entry] = catalogEntries([
    { poz_surumu_id: 'v1', poz_numarasi: '15.100', tanim: 'Kazı', birim: 'ton',
      kurum_kodu: 'CSB', kitap_adi: 'Insaat', donem: '2026-01', kaynak_url: null, kaynak_sayfa: null,
      fiyatlar: [{ id: 'p1', fiyat_turu: 'unit_price', tutar: '10', para_birimi_kodu: 'TRY', birim_ham: 'm' }] },
  ]);
  assert.equal(entry.unit, 'm', 'satir fiyatin kendi biriminde olmali');
  assert.equal(entry.pozBirimi, 'ton', 'poz birimi uyari icin tasinmali');
});

test('birim ayniysa isaret konmaz, yazim farki uyusmazlik sayilmaz', () => {
  const [entry] = catalogEntries([
    { poz_surumu_id: 'v1', poz_numarasi: '15.100', tanim: 'Kazı', birim: 'Adet',
      kurum_kodu: 'CSB', kitap_adi: 'Insaat', donem: '2026-01', kaynak_url: null, kaynak_sayfa: null,
      fiyatlar: [{ id: 'p1', fiyat_turu: 'unit_price', tutar: '10', para_birimi_kodu: 'TRY', birim_ham: 'adet' }] },
  ]);
  assert.equal(entry.pozBirimi, undefined);
});

test('fiyatin kendi birimi yoksa poz birimi kullanilir ve uyari cikmaz', () => {
  const [entry] = catalogEntries([
    { poz_surumu_id: 'v1', poz_numarasi: '15.100', tanim: 'Kazı', birim: 'm³',
      kurum_kodu: 'CSB', kitap_adi: 'Insaat', donem: '2026-01', kaynak_url: null, kaynak_sayfa: null,
      fiyatlar: [{ id: 'p1', fiyat_turu: 'unit_price', tutar: '10', para_birimi_kodu: 'TRY', birim_ham: null }] },
  ]);
  assert.equal(entry.unit, 'm³');
  assert.equal(entry.pozBirimi, undefined);
});
