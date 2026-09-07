import Decimal from 'decimal.js';

/**
 * Kâr, teklif ve teklifin kalemlere dağıtımı (K-06 · Soru 7-8).
 *
 * Maliyet hesabı buradan etkilenmez: teklif değerleri ayrı tutulur. Kararın
 * iki keskin kuralı bu modülü şekillendirir:
 *
 *  1. **İki kâr yöntemi birlikte uygulanmaz.** Ya maliyete kâr eklenir ya da
 *     hedef tekliften kâr geriye hesaplanır; kâr iki kez eklenmez.
 *  2. **Uyumsuzluk sessizce düzeltilmez.** Sabitlenen tutarlar toplam teklifi
 *     aşarsa ya da dağıtılacak tutar varken serbest kalem kalmazsa, sabit fiyat
 *     veya teklif hedefi değiştirilmez; fark bildirilir ve düzeltme istenir.
 */

export type KarYontemi =
  | { tur: 'oran'; deger: string }        // maliyete % kâr
  | { tur: 'sabit'; deger: string }       // maliyete sabit tutar kâr
  | { tur: 'hedefTeklif'; deger: string }; // hedef teklif; kâr geriye hesaplanır

export type KarSonucu = {
  toplamMaliyet: Decimal;
  kar: Decimal;
  teklif: Decimal;
  /** Teklif maliyetin altındaysa aradaki fark; değilse null. */
  zarar: Decimal | null;
};

export function karHesapla(toplamMaliyet: Decimal, yontem: KarYontemi): KarSonucu {
  let kar: Decimal;
  let teklif: Decimal;

  if (yontem.tur === 'hedefTeklif') {
    // Hedef korunur, kâr maliyete göre değişir. Maliyet hedefi aşarsa kâr
    // negatiftir ve zarar olarak gösterilir.
    teklif = new Decimal(yontem.deger);
    kar = teklif.minus(toplamMaliyet);
  } else {
    kar = yontem.tur === 'oran'
      ? toplamMaliyet.times(new Decimal(yontem.deger)).dividedBy(100)
      : new Decimal(yontem.deger);
    teklif = toplamMaliyet.plus(kar);
  }

  return {
    toplamMaliyet,
    kar,
    teklif,
    zarar: teklif.lt(toplamMaliyet) ? toplamMaliyet.minus(teklif) : null,
  };
}

export type TeklifKalemi = {
  id: string;
  /** Kalemin maliyet tutarı; dağıtım ağırlığı budur. */
  maliyet: Decimal;
  /** Kullanıcı sabitlediyse bu kalemin teklif tutarı. */
  sabitTutar?: Decimal;
};

export type DagitimSatiri = {
  id: string;
  maliyet: Decimal;
  teklifTutari: Decimal;
  sabit: boolean;
};

export type DagitimSonucu = {
  satirlar: DagitimSatiri[];
  /** Dağıtılamayan ya da fazla kalan tutar; sıfır değilse kullanıcı düzeltmeli. */
  fark: Decimal;
  uyari: string | null;
};

/**
 * Toplam teklifi kalemlere dağıtır.
 *
 * Sabitlenen kalemler tutarını korur; kalan tutar serbest kalemlerin maliyet
 * paylarına göre bölünür. Dağıtılamayan bir tutar kalırsa `fark` sıfırdan
 * farklı döner ve `uyari` doldurulur — çağıran bunu kullanıcıya göstermeli,
 * kendi başına düzeltmemeli.
 */
export function teklifiDagit(kalemler: TeklifKalemi[], toplamTeklif: Decimal): DagitimSonucu {
  const sabitler = kalemler.filter((k) => k.sabitTutar !== undefined);
  const serbestler = kalemler.filter((k) => k.sabitTutar === undefined);

  const sabitToplam = sabitler.reduce((t, k) => t.plus(k.sabitTutar!), new Decimal(0));
  const kalan = toplamTeklif.minus(sabitToplam);
  const serbestMaliyet = serbestler.reduce((t, k) => t.plus(k.maliyet), new Decimal(0));

  const satirlar: DagitimSatiri[] = kalemler.map((k) => ({
    id: k.id,
    maliyet: k.maliyet,
    sabit: k.sabitTutar !== undefined,
    teklifTutari: k.sabitTutar ?? new Decimal(0),
  }));

  if (kalan.isNegative()) {
    return {
      satirlar,
      fark: kalan,
      uyari: `Sabitlenen tutarlar toplam teklifi ${kalan.abs().toFixed(2)} TL aşıyor. ` +
        'Sabit fiyatları veya teklif hedefini gözden geçirin.',
    };
  }

  if (serbestler.length === 0) {
    return {
      satirlar,
      fark: kalan,
      uyari: kalan.isZero() ? null
        : `Dağıtılacak ${kalan.toFixed(2)} TL var ama sabitlenmemiş kalem yok. ` +
          'Bir kalemin sabitini kaldırın veya teklif hedefini değiştirin.',
    };
  }

  // Maliyeti sıfır olan serbest kalemler ağırlık veremez; bu durumda pay
  // hesaplanamaz ve kullanıcıya bildirilir (ayrıntı TEMEL-05'e bırakıldı).
  if (serbestMaliyet.isZero()) {
    return {
      satirlar,
      fark: kalan,
      uyari: 'Sabitlenmemiş kalemlerin maliyet toplamı sıfır olduğu için pay hesaplanamıyor.',
    };
  }

  for (const satir of satirlar) {
    if (satir.sabit) continue;
    satir.teklifTutari = kalan.times(satir.maliyet).dividedBy(serbestMaliyet);
  }

  const dagitilan = satirlar.reduce((t, s) => t.plus(s.teklifTutari), new Decimal(0));
  return { satirlar, fark: toplamTeklif.minus(dagitilan), uyari: null };
}

/** Kalem teklif tutarından birim fiyat. Miktar sıfırsa tanımsızdır. */
export function teklifBirimFiyati(teklifTutari: Decimal, miktar: Decimal): Decimal | null {
  return miktar.isZero() ? null : teklifTutari.dividedBy(miktar);
}
