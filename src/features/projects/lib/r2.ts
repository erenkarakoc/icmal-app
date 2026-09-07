import 'server-only';

import { createHash } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

/**
 * Hesap projelerinin içerik deposu (K-04 karma saklama).
 *
 * Buraya yazılan nesne yerel `.icmal` dosyasıyla **birebir aynıdır**: aynı ZIP,
 * aynı baytlar. Böylece tek bir kodek (`icmal-file.ts`) korunur ve dışa aktarma
 * düz kopyalamaya iner. Sunucu içeriği açmadan sorgulayamaz; listeleme ve arama
 * için gereken her şey `public.projeler` tablosundaki özet kolonlarındadır.
 *
 * Sürümleme yoktur: kaydetme aynı anahtarın üzerine yazar.
 *
 * Bu modül yalnız sunucuda çalışır. Kimlik bilgileri `NEXT_PUBLIC_` öneki
 * taşımaz; o önekli değişkenler tarayıcıya gönderilir ve gizli anahtarı sızdırır.
 */

function ayar(ad: string): string {
  const deger = process.env[ad];
  if (!deger) throw new Error(`${ad} tanımlı değil; R2 yapılandırması eksik.`);
  return deger;
}

let istemci: S3Client | null = null;

function s3(): S3Client {
  if (istemci) return istemci;
  const hesap = ayar('R2_ACCOUNT_ID');
  istemci = new S3Client({
    // AB yargı bölgesindeki bucket'lar farklı bir endpoint kullanır; o yüzden
    // açıkça verilmişse ona öncelik tanınır.
    endpoint: process.env.R2_ENDPOINT || `https://${hesap}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: ayar('R2_ACCESS_KEY_ID'),
      secretAccessKey: ayar('R2_SECRET_ACCESS_KEY'),
    },
  });
  return istemci;
}

export const ozet = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * Bir projenin nesne anahtarı. Sahip kimliği yola girer: R2 tarafında da
 * kullanıcı sınırı görünür kalır ve anahtar tahmin edilerek başkasının
 * projesine gidilemez.
 */
export function projeAnahtari(sahipId: string, projeId: string): string {
  return `projeler/${sahipId}/${projeId}.icmal`;
}

export async function projeYukle(
  anahtar: string,
  bytes: Uint8Array,
): Promise<{ anahtar: string; boyut: number; sha256: string }> {
  if (!bytes.length) throw new Error('Boş proje yazılamaz.');
  const sha256 = ozet(bytes);
  await s3().send(
    new PutObjectCommand({
      Bucket: ayar('R2_BUCKET'),
      Key: anahtar,
      Body: bytes,
      ContentType: 'application/zip',
      // Karşı taraf bozuk aktarımı sessizce kabul etmesin.
      ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
    }),
  );
  return { anahtar, boyut: bytes.length, sha256 };
}

/**
 * İçeriği indirir ve beklenen özetle doğrular. Özet tutmazsa hata verir:
 * bozuk bir dosyayı sessizce açmaktansa açmamak yeğdir.
 */
export async function projeIndir(anahtar: string, beklenenSha256: string): Promise<Uint8Array> {
  const cikti = await s3().send(
    new GetObjectCommand({ Bucket: ayar('R2_BUCKET'), Key: anahtar }),
  );
  if (!cikti.Body) throw new Error('Proje içeriği boş döndü.');
  const bytes = new Uint8Array(await cikti.Body.transformToByteArray());
  const gercek = ozet(bytes);
  if (gercek !== beklenenSha256) {
    throw new Error('Proje dosyası bozulmuş: içerik özeti kayıtla uyuşmuyor.');
  }
  return bytes;
}

/**
 * Nesneyi siler. Kayıt silindiğinde çağrılır; R2 sürüm tutmadığı için geri
 * dönüş yoktur (K-15: silinen proje geri alınamaz).
 */
export async function projeSil(anahtar: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: ayar('R2_BUCKET'), Key: anahtar }));
}
