import Decimal from 'decimal.js';

/**
 * Proje giderleri (K-06 · Soru 5-6).
 *
 * Her gider ya sabit tutardır ya da bir yüzdedir. Yüzdeli giderin varsayılan
 * hesap tabanı iş kalemleri toplamıdır; kullanıcı o gidere başka giderleri
 * açıkça ekleyerek tabanı büyütebilir.
 *
 * İki kural bu modülün varlık sebebi:
 *
 *  1. **Sıra sonucu değiştirmez.** Bağlantılar satır sırasıyla değil kimlikle
 *     kurulur, hesap bağımlılık sırasına göre çözülür.
 *  2. **Döngü reddedilir.** Bir gider kendini doğrudan ya da dolaylı olarak
 *     tabanına katarsa hesap tanımsızdır; sessizce bir sayı üretmek yerine
 *     açıklayıcı hata verilir.
 */

export type Gider = {
  id: string;
  ad: string;
  /** 'tutar' sabit meblağ, 'yuzde' oran. */
  tur: 'tutar' | 'yuzde';
  /** Tutarda meblağ, yüzdede oran (10 = %10). Tam duyarlık için metin. */
  deger: string;
  /**
   * Yalnız yüzde giderler için: tabana eklenecek diğer giderlerin kimlikleri.
   * Boş bırakılırsa taban yalnız iş kalemleri toplamıdır.
   */
  tabanGiderleri?: string[];
};

export type GiderSonucu = {
  id: string;
  ad: string;
  /** Yüzde giderin üzerinden hesaplandığı tutar; sabit giderde kalem toplamı. */
  taban: Decimal;
  /** Bu giderin projeye eklediği tutar. */
  tutar: Decimal;
};

export class GiderDongusuHatasi extends Error {
  // Düz alan, constructor parameter property değil: testler bu modülü doğrudan
  // import ediyor ve Node'un tip soyma kipi parameter property'yi reddediyor.
  readonly zincir: string[];

  constructor(zincir: string[]) {
    super(`Gider tabanı kendini içeriyor: ${zincir.join(' → ')}. Bu hesap tanımsızdır.`);
    this.name = 'GiderDongusuHatasi';
    this.zincir = zincir;
  }
}

/**
 * Giderleri çözer ve her birinin taban/tutar değerini döndürür.
 *
 * Dönen dizinin sırası girdi sırasıyla aynıdır, ama hesap bağımlılığa göre
 * yapılır: satırların ekrandaki sırası sonucu değiştirmez.
 */
export function giderleriHesapla(kalemToplami: Decimal, giderler: Gider[]): GiderSonucu[] {
  const indeks = new Map(giderler.map((g) => [g.id, g]));
  const cozulen = new Map<string, GiderSonucu>();
  const islemde = new Set<string>();
  const yol: string[] = [];

  function coz(id: string): GiderSonucu {
    const hazir = cozulen.get(id);
    if (hazir) return hazir;

    const gider = indeks.get(id);
    if (!gider) throw new Error(`Gider bulunamadı: ${id}`);

    if (islemde.has(id)) {
      // Zinciri döngünün başladığı yerden kes ki hata okunabilir olsun.
      const bas = yol.indexOf(gider.ad);
      throw new GiderDongusuHatasi([...yol.slice(bas === -1 ? 0 : bas), gider.ad]);
    }
    islemde.add(id);
    yol.push(gider.ad);

    let taban = kalemToplami;
    if (gider.tur === 'yuzde') {
      for (const bagliId of gider.tabanGiderleri ?? []) {
        // Kendine doğrudan bağlanma da döngüdür; coz() bunu yakalar.
        taban = taban.plus(coz(bagliId).tutar);
      }
    }

    const tutar = gider.tur === 'tutar'
      ? new Decimal(gider.deger)
      : taban.times(new Decimal(gider.deger)).dividedBy(100);

    const sonuc: GiderSonucu = { id, ad: gider.ad, taban, tutar };
    cozulen.set(id, sonuc);
    islemde.delete(id);
    yol.pop();
    return sonuc;
  }

  return giderler.map((g) => coz(g.id));
}

/** Giderlerin projeye eklediği toplam. Her gider bir kez sayılır. */
export function giderToplami(sonuclar: GiderSonucu[]): Decimal {
  return sonuclar.reduce((t, s) => t.plus(s.tutar), new Decimal(0));
}

/** İş kalemleri + giderler. Kâr ve teklif bunun üzerine gelir (K-06 Soru 7). */
export function toplamMaliyet(kalemToplami: Decimal, sonuclar: GiderSonucu[]): Decimal {
  return kalemToplami.plus(giderToplami(sonuclar));
}
