import Decimal from 'decimal.js';

/**
 * Mahal bazlı metraj (PROJE-02 · K-06 Soru 25).
 *
 * Bir iş kaleminin miktarı ya doğrudan yazılır ya da metraj satırlarından
 * hesaplanır. Metraj varsa miktar **ondan** gelir; kullanıcının daha önce elle
 * yazdığı değer silinmez, saklanır ve metraj kaldırılınca geri döner. Bu,
 * fiyat kaynağı için kurulan sözleşmenin aynısıdır (bkz. `satir-guncelle.ts`):
 * türetilmiş değer etkin olur, kullanıcının girdisi korunur, dönüş açıktır.
 *
 * **Miktar PARA DEĞİLDİR.** K-10 kaynak ve kullanıcı miktarını tam
 * hassasiyette tutar; burada kuruşa yuvarlama yapılmaz. Yuvarlama yalnız satır
 * TUTARINA uygulanır ve o `para.ts` işidir.
 *
 * **Minha bir fiyat indirimi değildir** (kartın kabul ölçütü). Düşülen ölçü
 * kendi satırında pozitif yazılır, `minha` işaretiyle toplamdan düşülür;
 * böylece neyin ne kadar düşüldüğü okunur kalır.
 */

export type MetrajSatiri = {
  id: string;
  /** Serbest mahal adı; boş olabilir ve aynı ad birden çok satırda kullanılır. */
  mahal: string;
  /**
   * Boş bırakılan alan çarpıma girmez: m² için en ve boy, m³ için üçü birden,
   * adet için yalnız adet doldurulur. Boş alan 1 sayılmaz, yok sayılır.
   */
  adet: Decimal | null;
  boy: Decimal | null;
  en: Decimal | null;
  yukseklik: Decimal | null;
  /** İşaretliyse ara toplam genel toplamdan düşülür. */
  minha: boolean;
};

const OLCULER = ['adet', 'boy', 'en', 'yukseklik'] as const;

/**
 * Bir metraj satırının ara toplamı: dolu ölçülerin çarpımı.
 *
 * Hiçbir ölçü girilmemişse sonuç sıfırdır — boş satırdan miktar uydurulmaz.
 * `minha` burada uygulanmaz; ara toplam her zaman pozitif okunur.
 */
export function araToplam(satir: MetrajSatiri): Decimal {
  let sonuc: Decimal | null = null;
  for (const alan of OLCULER) {
    const deger = satir[alan];
    if (deger === null) continue;
    sonuc = sonuc === null ? deger : sonuc.times(deger);
  }
  return sonuc ?? new Decimal(0);
}

/**
 * Kalemin metrajdan gelen miktarı. Minha işaretli satırlar düşülür.
 *
 * Sonuç negatif çıkabilir (düşülenler eklenenleri aşarsa); bu sessizce sıfıra
 * çekilmez, çünkü kullanıcının düzeltmesi gereken bir giriş hatasıdır.
 */
export function metrajToplami(satirlar: readonly MetrajSatiri[]): Decimal {
  return satirlar.reduce(
    (toplam, satir) =>
      satir.minha ? toplam.minus(araToplam(satir)) : toplam.plus(araToplam(satir)),
    new Decimal(0),
  );
}

/** Yalnız eklenen ölçüler; ekranda minha ile ayrı gösterilir. */
export function eklenenToplam(satirlar: readonly MetrajSatiri[]): Decimal {
  return satirlar.filter((s) => !s.minha).reduce((t, s) => t.plus(araToplam(s)), new Decimal(0));
}

/** Yalnız düşülen ölçüler; pozitif döner. */
export function minhaToplam(satirlar: readonly MetrajSatiri[]): Decimal {
  return satirlar.filter((s) => s.minha).reduce((t, s) => t.plus(araToplam(s)), new Decimal(0));
}

/** Aynı mahalde toplanmış ara toplamlar; mahal bazlı okuma için. */
export function mahallereGore(
  satirlar: readonly MetrajSatiri[],
): { mahal: string; toplam: Decimal }[] {
  const gruplar = new Map<string, Decimal>();
  for (const satir of satirlar) {
    const ad = satir.mahal.trim();
    const pay = satir.minha ? araToplam(satir).negated() : araToplam(satir);
    gruplar.set(ad, (gruplar.get(ad) ?? new Decimal(0)).plus(pay));
  }
  return [...gruplar.entries()].map(([mahal, toplam]) => ({ mahal, toplam }));
}
