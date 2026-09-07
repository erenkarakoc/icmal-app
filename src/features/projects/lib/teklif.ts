import Decimal from 'decimal.js';
import { kurusaYuvarla } from '../../../shared/lib/para.ts';

/**
 * Kâr, teklif ve teklifin kalemlere dağıtımı (K-06 · Soru 7-8 · K-10).
 *
 * Maliyet hesabı buradan etkilenmez: teklif değerleri ayrı tutulur. Kararın
 * iki keskin kuralı bu modülü şekillendirir:
 *
 *  1. **İki kâr yöntemi birlikte uygulanmaz.** Ya maliyete kâr eklenir ya da
 *     hedef tekliften kâr geriye hesaplanır; kâr iki kez eklenmez.
 *  2. **Uyumsuzluk sessizce düzeltilmez.** Sabitlenen tutarlar toplam teklifi
 *     aşarsa ya da dağıtılacak tutar varken serbest kalem kalmazsa, sabit fiyat
 *     veya teklif hedefi değiştirilmez; fark bildirilir ve düzeltme istenir.
 *
 * **Kuruş farkı (TEMEL-05.2).** Kâr, teklif ve her kalem tutarı paradır;
 * hepsi kuruşa yuvarlanır. Payların kuruşa inmesi neredeyse her zaman birkaç
 * kuruşluk bir artık bırakır. Bu artık ORTADA BIRAKILMAZ: bırakılsaydı
 * kullanıcı 1.000,00 TL teklif verirken satırların toplamı 999,98 çıkardı.
 *
 * Artık **en büyük kalan yöntemiyle** dağıtılır: paylar kuruşa kırpılır,
 * kalan kuruşlar kesir artığı en büyük kalemlere birer birer eklenir. Sonuç
 * iki şeyi birden verir — satırların toplamı teklife TAM eşittir ve hiçbir
 * kalem kendi tam payından bir kuruştan fazla sapmaz.
 *
 * Bu, kararın "sessizce değiştirilmez" kuralını çiğnemez: o kural **sabit
 * fiyatları ve teklif hedefini** korur, ikisine de dokunulmaz. Kuruş yalnız
 * serbest kalemler arasında gezer.
 *
 * Eşitlikte sıra sabittir (önce büyük maliyet, sonra kimlik): aynı girdiler
 * aynı sonucu vermeli.
 */

export type KarYontemi =
  | { tur: 'oran'; deger: string } // maliyete % kâr
  | { tur: 'sabit'; deger: string } // maliyete sabit tutar kâr
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
    teklif = kurusaYuvarla(new Decimal(yontem.deger));
    kar = teklif.minus(toplamMaliyet);
  } else {
    // Oranlı kâr kuruşa indirilir; teklif iki kuruş değerinin toplamı olduğu
    // için ayrıca yuvarlanmasına gerek kalmaz ve kâr + maliyet = teklif
    // eşitliği bozulmaz.
    kar = kurusaYuvarla(
      yontem.tur === 'oran'
        ? toplamMaliyet.times(new Decimal(yontem.deger)).dividedBy(100)
        : new Decimal(yontem.deger),
    );
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
export function teklifiDagit(kalemler: TeklifKalemi[], hamToplamTeklif: Decimal): DagitimSonucu {
  // Teklif ve sabit tutarlar paradır. Çağıran kuruşa indirmeyi unutmuş olsa
  // bile dağıtım kuruş üzerinden yürümeli, yoksa artık hesabı anlamsızlaşır.
  const toplamTeklif = kurusaYuvarla(hamToplamTeklif);
  const sabitler = kalemler.filter((k) => k.sabitTutar !== undefined);
  const serbestler = kalemler.filter((k) => k.sabitTutar === undefined);

  const sabitToplam = sabitler.reduce(
    (t, k) => t.plus(kurusaYuvarla(k.sabitTutar!)),
    new Decimal(0),
  );
  const kalan = toplamTeklif.minus(sabitToplam);
  const serbestMaliyet = serbestler.reduce((t, k) => t.plus(k.maliyet), new Decimal(0));

  const satirlar: DagitimSatiri[] = kalemler.map((k) => ({
    id: k.id,
    maliyet: k.maliyet,
    sabit: k.sabitTutar !== undefined,
    teklifTutari: k.sabitTutar === undefined ? new Decimal(0) : kurusaYuvarla(k.sabitTutar),
  }));

  if (kalan.isNegative()) {
    return {
      satirlar,
      fark: kalan,
      uyari:
        `Sabitlenen tutarlar toplam teklifi ${kalan.abs().toFixed(2)} TL aşıyor. ` +
        'Sabit fiyatları veya teklif hedefini gözden geçirin.',
    };
  }

  if (serbestler.length === 0) {
    return {
      satirlar,
      fark: kalan,
      uyari: kalan.isZero()
        ? null
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

  // 1) Tam pay hesaplanır, kuruşa KIRPILIR (sıfıra doğru). Kırpma her kalemde
  //    bir kuruştan az kaybettirir, dolayısıyla artık kalem sayısını aşamaz.
  const serbestSatirlar = satirlar.filter((s) => !s.sabit);
  const kesirler = new Map<string, Decimal>();
  for (const satir of serbestSatirlar) {
    const tamPay = kalan.times(satir.maliyet).dividedBy(serbestMaliyet);
    const taban = tamPay.toDecimalPlaces(2, Decimal.ROUND_DOWN);
    satir.teklifTutari = taban;
    kesirler.set(satir.id, tamPay.minus(taban).abs());
  }

  // 2) Kırpmadan artan kuruşlar en büyük kesir artığına sahip kalemlere birer
  //    birer verilir. Eşitlikte sıra sabit: önce büyük maliyet, sonra kimlik.
  const dagitilanTaban = satirlar.reduce((t, s) => t.plus(s.teklifTutari), new Decimal(0));
  const artik = toplamTeklif.minus(dagitilanTaban);
  const kurus = new Decimal('0.01');
  const adet = artik.abs().dividedBy(kurus).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

  if (adet > 0 && serbestSatirlar.length > 0) {
    const sira = [...serbestSatirlar].sort((a, b) => {
      const fark = kesirler.get(b.id)!.comparedTo(kesirler.get(a.id)!);
      if (fark !== 0) return fark;
      const maliyetFarki = b.maliyet.comparedTo(a.maliyet);
      if (maliyetFarki !== 0) return maliyetFarki;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const yon = artik.isNegative() ? kurus.negated() : kurus;
    for (let i = 0; i < adet; i += 1) {
      const hedef = sira[i % sira.length];
      hedef.teklifTutari = hedef.teklifTutari.plus(yon);
    }
  }

  // Artık dağıtıldığı için fark sıfır olmalı; yine de hesaplanıp döndürülür ki
  // bir gün bozulursa sessiz kalmasın.
  const dagitilan = satirlar.reduce((t, s) => t.plus(s.teklifTutari), new Decimal(0));
  return { satirlar, fark: toplamTeklif.minus(dagitilan), uyari: null };
}

/** Kalem teklif tutarından birim fiyat. Miktar sıfırsa tanımsızdır. */
export function teklifBirimFiyati(teklifTutari: Decimal, miktar: Decimal): Decimal | null {
  return miktar.isZero() ? null : teklifTutari.dividedBy(miktar);
}
