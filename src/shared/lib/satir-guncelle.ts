import Decimal from 'decimal.js';
import { satirTutari } from './para.ts';

/**
 * İş kalemi satırının güncellenme kuralları (PROJE-01 · K-06 Soru 3-4).
 *
 * İki maliyet ekranı bu mantığı birebir kopya olarak taşıyordu; ortak modüle
 * alındı. Kopya mantık bu projede tekrar tekrar tek yerde düzeltilip ötekinde
 * unutuldu (arama zaman aşımı, yuvarlama sözleşmesi, fiyat etiketleri).
 *
 * **Fiyat kaynağı sözleşmesi.** Kullanıcı katalogdan seçilmiş bir satırın
 * fiyatını elle değiştirirse hesapta ONUN fiyatı kullanılır, ama katalog anlık
 * görüntüsü **silinmez**: satır `elle` olarak işaretlenir ve kaynak fiyata
 * dönüş açık bir seçimle yapılır. Önceden kaynak korunuyor ama hiçbir işaret
 * konmuyordu; dosyada resmî fiyat 123,45 yazarken satırda 200 kullanılıyor ve
 * satır hâlâ "veritabanından" sayılıyordu.
 */

export type FiyatKaynagi = 'katalog' | 'elle' | 'analiz';

/** Satırın fiyat kaynağını çözmek için gereken asgari yüzey. */
export interface FiyatliSatir {
  pozNo: string;
  quantity: Decimal;
  /** Metraj satirlari; doluysa miktar ondan gelir (PROJE-02). */
  metraj?: { minha: boolean }[];
  elleMiktar?: Decimal;
  unitPrice: Decimal;
  total: Decimal;
  fromDatabase: boolean;
  source?: { priceAmount: string } | undefined;
  fiyatKaynagi?: FiyatKaynagi;
}

/** Eski dosyalarda alan yoktur: kaynak varsa katalog, yoksa elle sayılır. */
export function cozulmusKaynak(satir: FiyatliSatir): FiyatKaynagi {
  return satir.fiyatKaynagi ?? (satir.source ? 'katalog' : 'elle');
}

export function satiriGuncelle<T extends FiyatliSatir>(satir: T, degisiklik: Partial<T>): T {
  const yeni = { ...satir, ...degisiklik };

  // Poz numarası elle değişti: artık başka bir kalem, katalog izi geçersiz.
  if ('pozNo' in degisiklik && !('source' in degisiklik)) {
    yeni.source = undefined;
    yeni.fromDatabase = false;
    yeni.fiyatKaynagi = 'elle';
  }

  // Katalogdan seçim: fiyat kaynağı kataloğa döner.
  if ('source' in degisiklik && degisiklik.source) {
    yeni.fiyatKaynagi = 'katalog';
  }

  // Fiyat elle yazıldı: kaynak KORUNUR ama etkin değildir.
  if ('unitPrice' in degisiklik && !('source' in degisiklik)) {
    yeni.fiyatKaynagi = 'elle';
  }

  // Miktar elle yazildi: metraj yokken saklanan deger de guncellenir ki
  // metraj eklenip kaldirildiginda kullanici kendi sayisini geri bulsun.
  if ('quantity' in degisiklik && !yeni.metraj?.length) {
    yeni.elleMiktar = yeni.quantity;
  }

  if ('quantity' in degisiklik || 'unitPrice' in degisiklik) {
    yeni.total = satirTutari(yeni.quantity, yeni.unitPrice);
  }

  return yeni;
}

/**
 * Metraj degisince miktari yeniden baglar (PROJE-02).
 *
 * Metraj varsa miktar ONDAN gelir; yoksa kullanicinin elle yazdigi deger geri
 * doner. Elle deger hicbir zaman silinmez -- metraj eklemek kullanicinin
 * girdigi sayiyi kaybettirmemeli.
 */
export function metrajiUygula<T extends FiyatliSatir>(
  satir: T,
  metraj: NonNullable<T['metraj']>,
  toplam: Decimal,
): T {
  const miktar = metraj.length ? toplam : (satir.elleMiktar ?? new Decimal(0));
  return {
    ...satir,
    metraj,
    quantity: miktar,
    total: satirTutari(miktar, satir.unitPrice),
  };
}

/**
 * Kaynak fiyata dönüş. Açık bir kullanıcı seçimidir; hiçbir güncelleme bunu
 * kendiliğinden yapmaz. Kaynak yoksa satır olduğu gibi kalır.
 */
export function kaynakFiyatinaDon<T extends FiyatliSatir>(satir: T): T {
  if (!satir.source) return satir;
  const fiyat = new Decimal(satir.source.priceAmount);
  return {
    ...satir,
    unitPrice: fiyat,
    fiyatKaynagi: 'katalog',
    fromDatabase: true,
    total: satirTutari(satir.quantity, fiyat),
  };
}
