import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
         ListObjectsV2Command } from '@aws-sdk/client-s3';

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

function istemci(e) {
  return new S3Client({
    endpoint: e.R2_ENDPOINT || `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
  });
}

const ozet = (b) => createHash('sha256').update(b).digest('hex');

test('proje yaz, oku, ozetle dogrula ve sil', { skip: atla }, async () => {
  const s3 = istemci(env);
  const anahtar = `projeler/_test/${crypto.randomUUID()}.icmal`;
  // Gercek .icmal gibi ikili icerik; metin degil.
  const veri = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Array.from({length: 120}, (_, i) => i % 256)]);
  const beklenen = ozet(veri);

  try {
    await s3.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET, Key: anahtar, Body: veri,
      ContentType: 'application/zip',
      ChecksumSHA256: Buffer.from(beklenen, 'hex').toString('base64'),
    }));

    const g = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar }));
    const okunan = new Uint8Array(await g.Body.transformToByteArray());

    assert.equal(okunan.length, veri.length, 'okunan boyut yazilanla ayni olmali');
    assert.equal(ozet(okunan), beklenen, 'icerik ozeti yazilanla ayni olmali');
    assert.deepEqual(Array.from(okunan.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04], 'ZIP imzasi korunmali');
  } finally {
    await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar })).catch(() => {});
  }
});

test('silinen nesne gercekten gitmis olmali', { skip: atla }, async () => {
  const s3 = istemci(env);
  const anahtar = `projeler/_test/${crypto.randomUUID()}.icmal`;
  await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar, Body: new Uint8Array([1, 2, 3]) }));
  await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar }));

  const liste = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: anahtar }));
  assert.equal(liste.KeyCount ?? 0, 0, 'silinen anahtar listede kalmamali');
});

test('ustune yazma son icerigi birakir (surumleme yok)', { skip: atla }, async () => {
  const s3 = istemci(env);
  const anahtar = `projeler/_test/${crypto.randomUUID()}.icmal`;
  try {
    await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar, Body: new Uint8Array([1, 1, 1]) }));
    await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar, Body: new Uint8Array([2, 2, 2, 2]) }));

    const g = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar }));
    const okunan = new Uint8Array(await g.Body.transformToByteArray());
    assert.deepEqual(Array.from(okunan), [2, 2, 2, 2], 'ikinci yazim birincinin uzerine yazmali');

    const liste = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: anahtar }));
    assert.equal(liste.KeyCount, 1, 'ayni anahtar icin tek nesne olmali');
  } finally {
    await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar })).catch(() => {});
  }
});

test('bozuk ozet yazimi reddedilmeli', { skip: atla }, async () => {
  const s3 = istemci(env);
  const anahtar = `projeler/_test/${crypto.randomUUID()}.icmal`;
  const veri = new Uint8Array([9, 9, 9]);
  const yanlis = Buffer.from(ozet(new Uint8Array([1])), 'hex').toString('base64');

  await assert.rejects(
    () => s3.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET, Key: anahtar, Body: veri, ChecksumSHA256: yanlis,
    })),
    'yanlis sha256 ile yazim kabul edilmemeli',
  );
  await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: anahtar })).catch(() => {});
});
