import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  createProject,
  encodeProject,
  decodeProject,
  HESAP_SURUMU,
  MAX_PROJECT_BYTES,
} from '../src/features/projects/lib/icmal-file.ts';
const row = (id) => ({
  id,
  pozNo: '15.100',
  description: 'İmalat – ölçü',
  unit: 'm³',
  quantity: '1234567890.1234567890123456789',
  unitPrice: '-0.000000000000123456789',
  source: {
    versionId: 'v1',
    priceId: null,
    priceType: 'unit_price',
    priceAmount: '123.4500000000001',
    currency: 'TRY',
    unit: 'm³',
    institution: 'ÇŞİDB',
    period: '2026-01',
    book: 'İnşaat',
    url: null,
    page: 6,
  },
});
async function archive(value, extra = false) {
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(value));
  if (extra) zip.file('attachment.txt', 'keep me');
  return zip.generateAsync({ type: 'uint8array' });
}
test('50 rows and both tables retain exact decimals, Unicode, source and order', async () => {
  const project = createProject('Deneme');
  project.costRows = Array.from({ length: 50 }, (_, i) => row(String(i)));
  project.percentageRows = [
    { ...row('p1'), percentageLow: '15.23456789', percentageHigh: '25', useRange: true },
  ];
  assert.deepEqual(await decodeProject(await encodeProject(project)), project);
});
test('missing price and actual zero remain distinct', async () => {
  const p = createProject('Fiyat');
  p.costRows = [
    { ...row('a'), unitPrice: null },
    { ...row('b'), unitPrice: '0' },
  ];
  assert.deepEqual((await decodeProject(await encodeProject(p))).costRows, p.costRows);
});
test('duplicate ids, invalid decimal and unknown fields cannot be saved', async () => {
  const p = createProject('Hatalı');
  p.costRows = [row('a'), row('a')];
  await assert.rejects(encodeProject(p));
  p.costRows = [{ ...row('a'), quantity: 'NaN' }];
  await assert.rejects(encodeProject(p));
  p.costRows = [];
  await assert.rejects(encodeProject({ ...p, subscription: 'paid' }));
});
test('future versions and extra archive contents are rejected without data loss', async () => {
  // v2 artik gecerli surum; bir sonraki surum hala reddedilmeli.
  await assert.rejects(
    decodeProject(await archive({ ...createProject('Yeni'), version: 3 })),
    /sürümü desteklenmiyor/,
  );
  await assert.rejects(decodeProject(await archive(createProject('Ek'), true)), /Geçersiz/);
});

test('v1 dosyasi bos gider listesiyle yukseltilir', async () => {
  const v2 = createProject('Eski dosya');
  // Gercek bir v1 dosyasi: surum 1 ve gider alani hic yok.
  const v1 = { ...v2, version: 1 };
  delete v1.expenses;
  const okunan = await decodeProject(await archive(v1));
  assert.equal(okunan.version, 2, 'v1 dosyasi v2 olarak okunmali');
  assert.deepEqual(okunan.expenses, [], 'gider listesi bos baslamali');
  assert.equal(okunan.name, 'Eski dosya', 'ad korunmali');
});

test('gider satirlari kaydedilip geri okunur', async () => {
  const proje = {
    ...createProject('Giderli'),
    expenses: [
      { id: 's1', name: 'Şantiye kurulumu', kind: 'tutar', value: '100000' },
      { id: 'g1', name: 'Genel gider', kind: 'yuzde', value: '10', baseExpenseIds: ['s1'] },
    ],
  };
  const okunan = await decodeProject(await archive(proje));
  assert.equal(okunan.expenses.length, 2);
  assert.equal(okunan.expenses[1].value, '10', 'oran tam korunmali');
  assert.deepEqual(okunan.expenses[1].baseExpenseIds, ['s1'], 'taban secimi korunmali');
});

test('bilinmeyen tabana bagli gider reddedilir', async () => {
  const proje = {
    ...createProject('Kayip taban'),
    expenses: [
      { id: 'g1', name: 'Genel gider', kind: 'yuzde', value: '10', baseExpenseIds: ['yok'] },
    ],
  };
  await assert.rejects(decodeProject(await archive(proje)), /Geçersiz/);
});

test('yinelenen gider kimligi reddedilir', async () => {
  const proje = {
    ...createProject('Kopya'),
    expenses: [
      { id: 'ayni', name: 'Bir', kind: 'tutar', value: '1' },
      { id: 'ayni', name: 'Iki', kind: 'tutar', value: '2' },
    ],
  };
  await assert.rejects(decodeProject(await archive(proje)), /Geçersiz/);
});
test('invalid ZIP and malformed project data are rejected', async () => {
  await assert.rejects(decodeProject(new Uint8Array([1, 2, 3])), /Geçersiz/);
  await assert.rejects(decodeProject(await archive({ format: 'icmal', version: 1 })), /Geçersiz/);
});
test('compressed large content and oversized input are bounded', async () => {
  const zip = new JSZip();
  zip.file('project.json', ' '.repeat(MAX_PROJECT_BYTES + 1));
  await assert.rejects(
    decodeProject(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })),
    /boyut sınırını/,
  );
  await assert.rejects(decodeProject(new Uint8Array(MAX_PROJECT_BYTES + 1)), /boyut sınırını/);
});
test('normalized traversal entry is rejected', async () => {
  const zip = new JSZip();
  zip.file('../project.json', JSON.stringify(createProject('Yol')));
  await assert.rejects(decodeProject(await zip.generateAsync({ type: 'uint8array' })), /Geçersiz/);
});

test('teklif alani kaydedilip geri okunur', async () => {
  const temel = createProject('Teklifli');
  const satir = {
    id: 'r1',
    pozNo: 'A',
    description: 'Kalem',
    unit: 'm2',
    quantity: '10',
    unitPrice: '100',
  };
  const proje = {
    ...temel,
    costRows: [satir],
    offer: {
      method: 'hedefTeklif',
      value: '1350000',
      fixedRows: [{ rowId: 'r1', amount: '800000' }],
    },
  };
  const okunan = await decodeProject(await archive(proje));
  assert.equal(okunan.offer.method, 'hedefTeklif');
  assert.equal(okunan.offer.value, '1350000', 'hedef tam korunmali');
  assert.deepEqual(
    okunan.offer.fixedRows,
    [{ rowId: 'r1', amount: '800000' }],
    'sabit satir korunmali',
  );
});

test('teklif alani olmayan proje gecerlidir', async () => {
  const okunan = await decodeProject(await archive(createProject('Teklifsiz')));
  assert.equal(okunan.offer, undefined, 'teklif yapilmamis proje de acilmali');
});

test('var olmayan kalemi sabitleyen teklif reddedilir', async () => {
  const proje = {
    ...createProject('Kayip satir'),
    offer: { method: 'oran', value: '10', fixedRows: [{ rowId: 'olmayan', amount: '1000' }] },
  };
  await assert.rejects(decodeProject(await archive(proje)), /Geçersiz/);
});

// --- TEMEL-05.3 · hesap yontemi surumu --------------------------------------

test('yeni proje guncel hesap surumuyle damgalanir', () => {
  assert.equal(createProject('P').calcVersion, HESAP_SURUMU);
});

test('damga gidis-donuste korunur', async () => {
  const p = createProject('P');
  const geri = await decodeProject(await encodeProject(p));
  assert.equal(geri.calcVersion, HESAP_SURUMU);
});

test('damgasiz eski dosya reddedilmez, bilinmiyor sayilir', async () => {
  // Yoklugu "guncel" degil "bilinmiyor" demektir; dosya yine de acilmali.
  const p = createProject('P');
  delete p.calcVersion;
  const geri = await decodeProject(await encodeProject(p));
  assert.equal(geri.calcVersion, undefined);
});

test('gecersiz damga reddedilir', async () => {
  const p = createProject('P');
  p.calcVersion = 0;
  await assert.rejects(() => encodeProject(p));
});
