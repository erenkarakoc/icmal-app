/**
 * Sürüm notu ayrıştırıcısı.
 *
 * Notlar `release.yml` tarafından commit'lerden üretilir ve GitHub release
 * gövdesine **Markdown** olarak yazılır:
 *
 *     ## Yenilikler
 *     - ...
 *
 * Ama uygulamaya Markdown olarak GELMEZ. `electron-updater`'ın GitHub
 * sağlayıcısı notu release Atom feed'indeki `<content type="html">`
 * elemanından okur ve GitHub orada gövdeyi **HTML'e çevirmiş** olarak sunar:
 *
 *     <h2>Yenilikler</h2><ul><li>...</li></ul>
 *
 * Bu yüzden iki biçim de tanınır. Yalnız başlık ve madde yapısı çözülür; tam
 * bir Markdown/HTML ayrıştırıcı değildir ve olmasına gerek yoktur. Tanınmayan
 * içerik düz metin olarak madde sayılır, yani biçim değişse de kaybolmaz.
 */
export type NotBloku = { baslik: string | null; maddeler: string[] };

/** `&lt;` gibi kaçışları ve sayısal kodları çözer. */
function varlikCoz(metin: string): string {
  return metin
    .replace(/&#(\d+);/g, (_, kod: string) => String.fromCodePoint(Number(kod)))
    .replace(/&#x([0-9a-f]+);/gi, (_, kod: string) => String.fromCodePoint(parseInt(kod, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // &amp; en sona: once cozulurse "&amp;lt;" yanlis cozulur.
    .replace(/&amp;/g, '&');
}

/** İç etiketleri atar, kaçışları çözer, boşlukları toplar. */
function metniAyikla(ham: string): string {
  return varlikCoz(ham.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function htmlAyristir(ham: string): NotBloku[] {
  const bloklar: NotBloku[] = [];
  let aktif: NotBloku | null = null;

  // Basliklar ve maddeler belge sirasinda gezilir; siralama korunmali.
  const desen = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  for (const eslesme of ham.matchAll(desen)) {
    if (eslesme[1]) {
      const baslik = metniAyikla(eslesme[2]);
      aktif = { baslik: baslik || null, maddeler: [] };
      bloklar.push(aktif);
      continue;
    }
    const madde = metniAyikla(eslesme[3] ?? '');
    if (!madde) continue;
    if (!aktif) {
      aktif = { baslik: null, maddeler: [] };
      bloklar.push(aktif);
    }
    aktif.maddeler.push(madde);
  }

  // Etiketli ama listesiz gövde (orn. yalniz <p>) kaybolmasin.
  if (!bloklar.length) {
    const duz = metniAyikla(ham);
    if (duz) bloklar.push({ baslik: null, maddeler: [duz] });
  }

  return bloklar.filter((b) => b.maddeler.length > 0 || b.baslik);
}

function markdownAyristir(ham: string): NotBloku[] {
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

export function releaseNotlariniAyristir(ham: string): NotBloku[] {
  if (!ham.trim()) return [];
  // GitHub'dan gelen bicim HTML; release.yml'nin yazdigi kaynak Markdown.
  const html = /<(h[1-6]|ul|ol|li|p|div|br)\b[^>]*>/i.test(ham);
  return html ? htmlAyristir(ham) : markdownAyristir(ham);
}
