/**
 * Sürüm notu ayrıştırıcısı.
 *
 * Notlar `release.yml` tarafından commit'lerden üretilir ve GitHub release
 * gövdesine Markdown olarak yazılır:
 *
 *     ## Yenilikler
 *     - ...
 *     ## Düzeltmeler
 *     - ...
 *
 * Burada yalnız bu iki yapı (başlık ve madde) tanınır — tam bir Markdown
 * ayrıştırıcı değildir ve olmasına gerek yoktur. Tanınmayan satırlar düz metin
 * olarak madde sayılır, yani biçim değişse de içerik kaybolmaz.
 */
export type NotBloku = { baslik: string | null; maddeler: string[] };

export function releaseNotlariniAyristir(ham: string): NotBloku[] {
  const bloklar: NotBloku[] = [];
  let aktif: NotBloku | null = null;

  for (const satir of ham.replace(/\r\n/g, '\n').split('\n')) {
    const temiz = satir.trim();
    if (!temiz) continue;

    const baslik = temiz.match(/^#{1,6}\s+(.*)$/);
    if (baslik) {
      aktif = { baslik: baslik[1].trim(), maddeler: [] };
      bloklar.push(aktif);
      continue;
    }

    const madde = temiz.match(/^[-*]\s+(.*)$/);
    const metin = madde ? madde[1].trim() : temiz;
    if (!aktif) {
      aktif = { baslik: null, maddeler: [] };
      bloklar.push(aktif);
    }
    if (metin) aktif.maddeler.push(metin);
  }

  return bloklar.filter((b) => b.maddeler.length > 0 || b.baslik);
}
