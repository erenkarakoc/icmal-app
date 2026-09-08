/**
 * Fiyat sunum sözlüğü (TEMEL-04 · K-09).
 *
 * Kataloğun fiyat türleri, kendi birimi ve dahil/hariç bayrakları burada tek
 * bir yerden yorumlanır. Daha önce bu bilgi iki ekranda ayrı ayrı ele alınıyor,
 * biri diğerinden sapıyordu: maliyet seçicisi fiyatın kendi birimini kullanıp
 * her türü ayrı kayıt yaparken, birim fiyat sayfası yalnız `unit_price` arıyor
 * ve bulamayınca **kilit** gösteriyordu — kullanıcı bunu "yetkim yok" sanıyordu.
 *
 * Canlı ölçüm (2026-09-08): 41.380 poz sürümünün 7.184'ünde `unit_price` yok;
 * bunların 5.563'ünde rayiç fiyatı **var**. Kilit yalnız erişim kısıtı içindir.
 */

/** Katalogda görülen bütün fiyat türleri (canlı sayım ile doğrulandı). */
export const FIYAT_ETIKETLERI: Record<string, string> = {
  unit_price: 'Birim fiyat',
  rayic: 'Rayiç',
  montage_price: 'Montaj',
  demontage_price: 'Demontaj',
  alternate_unit_price: 'Alternatif birim',
};

/**
 * Bilinmeyen tür ETİKETSİZ bırakılmaz; ham kod gösterilir. Uydurma bir ad
 * vermek, kaynakta olmayan bir anlam üretmek olurdu.
 */
export function fiyatEtiketi(tur: string): string {
  return FIYAT_ETIKETLERI[tur] ?? tur;
}

/**
 * Listede gösterilecek fiyatın seçim sırası. `unit_price` her zaman önce
 * gelir; yoksa kullanıcıya boşluk değil eldeki fiyat gösterilir.
 */
const SIRA = ['unit_price', 'rayic', 'alternate_unit_price', 'montage_price', 'demontage_price'];

export type Fiyat = {
  fiyat_turu: string;
  tutar: number;
  para_birimi_kodu: string;
  birim_ham?: string | null;
  kar_dahil_mi?: boolean | null;
  kdv_dahil_mi?: boolean | null;
  genel_giderler_dahil_mi?: boolean | null;
};

/** Listede gösterilecek fiyat; hiç fiyat yoksa `null`. */
export function gosterilecekFiyat<T extends Fiyat>(
  fiyatlar: readonly T[] | null | undefined,
): T | null {
  if (!fiyatlar?.length) return null;
  for (const tur of SIRA) {
    const bulunan = fiyatlar.find((f) => f.fiyat_turu === tur);
    if (bulunan) return bulunan;
  }
  // Sirada olmayan bir tur gelirse kaybolmasin.
  return fiyatlar[0];
}

/**
 * Birim karşılaştırması. Kaynak yazımı DEĞİŞTİRİLMEZ; yalnız karşılaştırma
 * için büyük/küçük harf ve boşluk farkı yok sayılır — katalogda `ad`, `Adet`,
 * `AD` gibi yazımlar bir arada bulunuyor.
 *
 * Bu bir birim DÖNÜŞÜMÜ değildir: `m` ile `ton` farklı sayılır ve öyle kalır.
 */
export function birimEsit(a: string | null | undefined, b: string | null | undefined): boolean {
  const d = (v: string | null | undefined) => (v ?? '').trim().toLocaleLowerCase('tr');
  return d(a) === d(b);
}

/**
 * Fiyatın kendi birimi poz biriminden farklıysa döner; aynıysa `null`.
 *
 * Canlı ölçümde 98 satırda farklı (89'u `m` fiyat / `ton` poz). Bu satırlarda
 * dönüşüm YAPILMAZ; kullanıcıya gösterilir ve uyarılır.
 */
export function farkliFiyatBirimi(
  fiyatBirimi: string | null | undefined,
  pozBirimi: string | null | undefined,
): string | null {
  const f = fiyatBirimi?.trim();
  if (!f) return null;
  return birimEsit(f, pozBirimi) ? null : f;
}

/**
 * Dahil/hariç rozetleri. Yalnız BİLİNEN alanlar gösterilir; `null` "bilinmiyor"
 * demektir ve "hariç" diye sunulmaz.
 */
export function dahilRozetleri(fiyat: Fiyat): string[] {
  const rozetler: string[] = [];
  if (fiyat.kar_dahil_mi === true) rozetler.push('kâr dahil');
  else if (fiyat.kar_dahil_mi === false) rozetler.push('kâr hariç');
  if (fiyat.kdv_dahil_mi === true) rozetler.push('KDV dahil');
  else if (fiyat.kdv_dahil_mi === false) rozetler.push('KDV hariç');
  if (fiyat.genel_giderler_dahil_mi === true) rozetler.push('genel giderler dahil');
  else if (fiyat.genel_giderler_dahil_mi === false) rozetler.push('genel giderler hariç');
  return rozetler;
}
