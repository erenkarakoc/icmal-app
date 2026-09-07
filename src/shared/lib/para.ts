import Decimal from 'decimal.js';

/**
 * Para ve yuvarlama sözleşmesi (K-10 · Soru 26).
 *
 * Tek kural, tek yer. Ekran, Excel ve PDF aynı sonucu vermek zorundadır; bu
 * yüzden satır tutarı hiçbir çağrı yerinde `miktar.times(birimFiyat)` olarak
 * hesaplanmamalı, hep buradan geçmelidir.
 *
 * Sözleşme:
 *
 *  - **Kaynak ve kullanıcı değerleri tam hassasiyetle saklanır.** Miktar ve
 *    birim fiyat yuvarlanmaz; gösterim kısaltması hesap girdisi değildir.
 *  - **Satır tutarı 2 ondalığa, yarımda sıfırdan uzağa yuvarlanır.**
 *  - **Kalemler toplamı yuvarlanmış satırlardan üretilir.** Yuvarlanmamış
 *    çarpımları toplayıp sonunda yuvarlamak DEĞİLDİR: iki ayrı 0,005 TL'lik
 *    kalem 0,01 değil 0,02 TL toplam verir, çünkü her satır kendi başına
 *    kuruşa yuvarlanır ve kullanıcı satırda o değeri görür.
 *
 * Yuvarlama kipi her çağrıda AÇIKÇA verilir. decimal.js'in genel ayarı
 * süreç genelinde değiştirilebilir (`ekap-crypto.ts` bunu yapıyor); para
 * hesabı böyle bir yan etkiye bağlı kalmamalı.
 */

/** Satır tutarının ondalık basamağı. */
export const KURUS_BASAMAGI = 2;

/** Normal görünümde gösterilecek en çok ondalık (K-10). */
export const GORUNUM_BASAMAGI = 6;

/** Yarımda sıfırdan uzağa. */
const YUVARLAMA = Decimal.ROUND_HALF_UP;

/**
 * Bir iş kaleminin tutarı: miktar × birim fiyat, kuruşa yuvarlanmış.
 *
 * Girdiler tam hassasiyette kalır; yuvarlama yalnız sonuca uygulanır.
 */
export function satirTutari(miktar: Decimal, birimFiyat: Decimal): Decimal {
  return miktar.times(birimFiyat).toDecimalPlaces(KURUS_BASAMAGI, YUVARLAMA);
}

/**
 * Kalemler toplamı. Satırların ZATEN yuvarlanmış olduğu varsayılmaz; her biri
 * yeniden kuruşa indirilir ki çağıran yerin dikkatsizliği toplama sızmasın.
 */
export function kalemlerToplami(tutarlar: readonly Decimal[]): Decimal {
  return tutarlar.reduce(
    (toplam, tutar) => toplam.plus(tutar.toDecimalPlaces(KURUS_BASAMAGI, YUVARLAMA)),
    new Decimal(0),
  );
}

/**
 * Bir tutarı kuruşa indirir. Dışarıdan gelen (dosya, Excel, katalog) tutarları
 * toplama katmadan önce sözleşmeye sokmak için.
 */
export function kurusaYuvarla(tutar: Decimal): Decimal {
  return tutar.toDecimalPlaces(KURUS_BASAMAGI, YUVARLAMA);
}

/**
 * Normal görünümde bir miktar/birim fiyat değeri: en çok 6 ondalık.
 *
 * Bu YALNIZ gösterimdir. Döndürülen değer hesaba girdi olarak kullanılmamalı;
 * düzenleme ve ayrıntı ekranları tam değeri gösterir.
 */
export function gorunumDegeri(deger: Decimal): Decimal {
  return deger.decimalPlaces() > GORUNUM_BASAMAGI
    ? deger.toDecimalPlaces(GORUNUM_BASAMAGI, YUVARLAMA)
    : deger;
}
