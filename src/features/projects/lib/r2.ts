import 'server-only';

import { createHash } from 'node:crypto';

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
 * BU MODÜL R2 KİMLİK BİLGİSİ TUTMAZ. Masaüstünde Next sunucusu kullanıcının
 * kendi makinesinde çalışır; pakete konan bir gizli anahtar her müşteride
 * açıkta olur ve tek bir sızıntı bütün kullanıcıların dosyalarına yazma yetkisi
 * verirdi. Bunun yerine `proje-dosyasi` Supabase Edge Function'ı çağrılır:
 * kullanıcının belirtecini doğrular, nesne anahtarını **kendi** üretir ve kısa
 * ömürlü imzalı bir URL döndürür. Baytların aktarımı buradan yapılır, yetki
 * orada verilir.
 */

const ISLEV_ADI = 'proje-dosyasi';

/** Yalın hex özet: `public.projeler.icerik_sha256` bu biçimde saklanır. */
export const ozet = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * Bir projenin nesne anahtarı. Sahip kimliği yola girer: R2 tarafında da
 * kullanıcı sınırı görünür kalır ve anahtar tahmin edilerek başkasının
 * projesine gidilemez.
 *
 * Aynı biçim Edge Function içinde de üretilir; oradaki üretim yetkilidir, bu
 * işlev yalnız veritabanı kolonunu doldurmak içindir.
 */
export function projeAnahtari(sahipId: string, projeId: string): string {
  return `projeler/${sahipId}/${projeId}.icmal`;
}

type Islem = 'yukle' | 'indir' | 'sil';

/** Edge Function'dan tek kullanımlık imzalı URL ister. */
async function imzaliUrl(
  belirtec: string,
  islem: Islem,
  projeId: string,
  sha256b64?: string,
): Promise<string> {
  const taban = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!taban) throw new Error('NEXT_PUBLIC_SUPABASE_URL tanımlı değil.');

  const yanit = await fetch(`${taban}/functions/v1/${ISLEV_ADI}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${belirtec}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ islem, projeId, ...(sha256b64 ? { sha256: sha256b64 } : {}) }),
  });

  if (!yanit.ok) {
    // Fonksiyonun kendi hata mesajı varsa onu göster; kullanıcı "bir şey oldu"
    // yerine sebebi görsün.
    const govde = await yanit.json().catch(() => null);
    const mesaj =
      govde && typeof govde === 'object' && 'hata' in govde
        ? String((govde as { hata: unknown }).hata)
        : `Proje deposuna erişilemedi (HTTP ${yanit.status}).`;
    throw new Error(mesaj);
  }

  const { url } = (await yanit.json()) as { url: string };
  return url;
}

export async function projeYukle(
  belirtec: string,
  sahipId: string,
  projeId: string,
  bytes: Uint8Array,
): Promise<{ anahtar: string; boyut: number; sha256: string }> {
  if (!bytes.length) throw new Error('Boş proje yazılamaz.');
  const sha256 = ozet(bytes);
  const sha256b64 = Buffer.from(sha256, 'hex').toString('base64');

  const url = await imzaliUrl(belirtec, 'yukle', projeId, sha256b64);
  const yanit = await fetch(url, {
    method: 'PUT',
    body: bytes as unknown as BodyInit,
    // Özet imzanın parçasıdır; başlık gönderilmezse R2 imzayı reddeder.
    // Karşı taraf bozuk aktarımı da sessizce kabul etmez.
    headers: { 'x-amz-checksum-sha256': sha256b64 },
  });
  if (!yanit.ok) {
    throw new Error(`Proje içeriği yazılamadı (HTTP ${yanit.status}).`);
  }

  return { anahtar: projeAnahtari(sahipId, projeId), boyut: bytes.length, sha256 };
}

/**
 * İçeriği indirir ve beklenen özetle doğrular. Özet tutmazsa hata verir:
 * bozuk bir dosyayı sessizce açmaktansa açmamak yeğdir.
 */
export async function projeIndir(
  belirtec: string,
  projeId: string,
  beklenenSha256: string,
): Promise<Uint8Array> {
  const url = await imzaliUrl(belirtec, 'indir', projeId);
  const yanit = await fetch(url);
  if (!yanit.ok) throw new Error(`Proje içeriği okunamadı (HTTP ${yanit.status}).`);

  const bytes = new Uint8Array(await yanit.arrayBuffer());
  if (!bytes.length) throw new Error('Proje içeriği boş döndü.');
  if (ozet(bytes) !== beklenenSha256) {
    throw new Error('Proje dosyası bozulmuş: içerik özeti kayıtla uyuşmuyor.');
  }
  return bytes;
}

/**
 * Nesneyi siler. Kayıt silindiğinde çağrılır; R2 sürüm tutmadığı için geri
 * dönüş yoktur (K-15: silinen proje geri alınamaz).
 */
export async function projeSil(belirtec: string, projeId: string): Promise<void> {
  const url = await imzaliUrl(belirtec, 'sil', projeId);
  const yanit = await fetch(url, { method: 'DELETE' });
  // R2 silmede 204 döner; olmayan nesne için de 204 kabul edilir.
  if (!yanit.ok && yanit.status !== 404) {
    throw new Error(`Proje içeriği silinemedi (HTTP ${yanit.status}).`);
  }
}
