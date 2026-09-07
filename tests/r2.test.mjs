import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AwsClient } from 'aws4fetch';

/**
 * Bu testler `proje-dosyasi` Edge Function'inin yaptigi isi birebir tekrarlar:
 * kisa omurlu imzali URL uretip baytlari onun uzerinden tasir. Uygulama artik
 * R2 kimlik bilgisi tutmaz; buradaki degerler yalniz gelistirme makinesindedir.
 */

// .env.local yalniz gelistirme makinesinde vardir; CI'da bu testler atlanir.
function ortam() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return null;
  const d = {};
  for (const satir of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const e = satir.match(/^([A-Z_0-9]+)=(.*)$/);
    if (e && e[2]) d[e[1]] = e[2];
  }
  return d.R2_ACCOUNT_ID && d.R2_BUCKET && d.R2_ACCESS_KEY_ID && d.R2_SECRET_ACCESS_KEY ? d : null;
}

const env = ortam();
const atla = env ? false : 'R2 yapilandirmasi yok (.env.local eksik)';

const hex = (b) => createHash('sha256').update(b).digest('hex');
const b64 = (b) => createHash('sha256').update(b).digest('base64');

function istemci(e) {
  return new AwsClient({
    accessKeyId: e.R2_ACCESS_KEY_ID,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
}

/** Edge Function'daki imzalama ile ayni: sorgu imzasi, kisa omur. */
async function imzala(e, anahtar, method, headers = {}, omur = 120) {
  const endpoint = e.R2_ENDPOINT || `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url = new URL(`${endpoint}/${e.R2_BUCKET}/${anahtar}`);
  url.searchParams.set('X-Amz-Expires', String(omur));
  const imzali = await istemci(e).sign(url.toString(), {
    method,
    headers,
    aws: { signQuery: true },
  });
  return imzali.url;
}

const yeniAnahtar = () => `projeler/_test/${randomUUID()}.icmal`;

async function temizle(e, anahtar) {
  await fetch(await imzala(e, anahtar, 'DELETE'), { method: 'DELETE' }).catch(() => {});
}

test('imzali URL ile proje yaz, oku ve ozetle dogrula', { skip: atla }, async () => {
  const anahtar = yeniAnahtar();
  // Gercek .icmal gibi ikili icerik; metin degil.
  const veri = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Array.from({ length: 120 }, (_, i) => i % 256)]);
  const ozet = b64(veri);

  try {
    const put = await fetch(await imzala(env, anahtar, 'PUT', { 'x-amz-checksum-sha256': ozet }), {
      method: 'PUT',
      body: veri,
      headers: { 'x-amz-checksum-sha256': ozet },
    });
    assert.equal(put.status, 200, 'imzali yazim kabul edilmeli');

    const get = await fetch(await imzala(env, anahtar, 'GET'));
    const okunan = new Uint8Array(await get.arrayBuffer());

    assert.equal(okunan.length, veri.length, 'okunan boyut yazilanla ayni olmali');
    assert.equal(hex(okunan), hex(veri), 'icerik ozeti yazilanla ayni olmali');
    assert.deepEqual(Array.from(okunan.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04], 'ZIP imzasi korunmali');
  } finally {
    await temizle(env, anahtar);
  }
});

test('silinen nesne gercekten gitmis olmali', { skip: atla }, async () => {
  const anahtar = yeniAnahtar();
  const veri = new Uint8Array([1, 2, 3]);
  await fetch(await imzala(env, anahtar, 'PUT', { 'x-amz-checksum-sha256': b64(veri) }), {
    method: 'PUT',
    body: veri,
    headers: { 'x-amz-checksum-sha256': b64(veri) },
  });

  const sil = await fetch(await imzala(env, anahtar, 'DELETE'), { method: 'DELETE' });
  assert.equal(sil.status, 204, 'silme 204 donmeli');

  const get = await fetch(await imzala(env, anahtar, 'GET'));
  assert.equal(get.status, 404, 'silinen anahtar bulunmamali');
});

test('ustune yazma son icerigi birakir (surumleme yok)', { skip: atla }, async () => {
  const anahtar = yeniAnahtar();
  const ilk = new Uint8Array([1, 1, 1]);
  const son = new Uint8Array([2, 2, 2, 2]);
  try {
    for (const veri of [ilk, son]) {
      await fetch(await imzala(env, anahtar, 'PUT', { 'x-amz-checksum-sha256': b64(veri) }), {
        method: 'PUT',
        body: veri,
        headers: { 'x-amz-checksum-sha256': b64(veri) },
      });
    }
    const get = await fetch(await imzala(env, anahtar, 'GET'));
    const okunan = new Uint8Array(await get.arrayBuffer());
    assert.deepEqual(Array.from(okunan), [2, 2, 2, 2], 'ikinci yazim birincinin uzerine yazmali');
  } finally {
    await temizle(env, anahtar);
  }
});

test('bozuk ozet yazimi reddedilmeli', { skip: atla }, async () => {
  const anahtar = yeniAnahtar();
  const veri = new Uint8Array([9, 9, 9]);
  const yanlis = b64(new Uint8Array([1]));

  const put = await fetch(await imzala(env, anahtar, 'PUT', { 'x-amz-checksum-sha256': yanlis }), {
    method: 'PUT',
    body: veri,
    headers: { 'x-amz-checksum-sha256': yanlis },
  });
  assert.equal(put.ok, false, 'yanlis sha256 ile yazim kabul edilmemeli');
  await temizle(env, anahtar);
});

test('imzanin omru dolunca erisim kapanir', { skip: atla }, async () => {
  // Kisa omur guvenligin bel kemigi: sizan bir URL kalici erisim olmamali.
  const anahtar = yeniAnahtar();
  const eski = await imzala(env, anahtar, 'GET', {}, 1);
  await new Promise((r) => setTimeout(r, 2500));
  const get = await fetch(eski);
  assert.equal(get.status, 403, 'suresi gecmis imza reddedilmeli');
});

test('imza yalniz imzalandigi anahtar icin gecerlidir', { skip: atla }, async () => {
  // Edge Function anahtari JWT'den uretir; imzalanan yol disina cikilamamali.
  const benim = yeniAnahtar();
  const baskasi = yeniAnahtar();
  const url = new URL(await imzala(env, benim, 'GET'));
  const kaydirilmis = url.toString().replace(encodeURI(benim), encodeURI(baskasi));

  const get = await fetch(kaydirilmis);
  assert.equal(get.status, 403, 'baska anahtara kaydirilan imza reddedilmeli');
});
