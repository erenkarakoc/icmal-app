import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Para hesabı bekçisi.
 *
 * NEDEN VAR: K-10 yuvarlama sözleşmesi 2026-09-08'de yazıldığında kodda
 * uygulanmadığı **beş ayrı yer** bulundu. Hepsinin ortak sebebi aynıydı —
 * aynı hesap birden çok yerde tekrar yazılmış, biri düzeltilmiş öteki
 * unutulmuştu. Aynı hata sınıfı poz aramasında da yaşandı: zaman aşımı
 * düzeltmesi iki kopyadan yalnız birine uygulandı.
 *
 * Bu test yeni bir çarpma/bölmenin sessizce eklenmesini engeller. Aşağıdaki
 * liste **gözden geçirilmiş** hesapları tutar; listede olmayan her yeni
 * kullanım testi düşürür.
 *
 * YENİ BİR SATIR EKLERKEN: önce `shared/lib/para.ts` işlevlerinin işi görüp
 * görmediğine bak. Görmüyorsa satırı buraya gerekçesiyle ekle. Gerekçe
 * yazamıyorsan büyük ihtimalle sözleşmeyi atlıyorsundur.
 */

const KLASORLER = [
  'src/features/cost-estimate',
  'src/features/percentage-cost',
  'src/features/projects',
  'src/shared/lib',
];

// Sozlesmenin kendisi; kendi kendini denetlemez.
const HARIC = ['src/shared/lib/para.ts'];

const ARITMETIK = /\.times\(|\.dividedBy\(|\.div\(/;

/** Gözden geçirilmiş hesaplar: kod parçası → neden sözleşme dışı olabildiği. */
const IZINLI = new Map([
  // --- Sozlesmeden GECEN hesaplar (kurusaYuvarla/satirTutari ile sarili) ---
  [
    'return kurusaYuvarla(total.div(effectivePercentage).times(100));',
    'Tahmini maliyet tutardir; kurusaYuvarla ile sarili.',
  ],
  [
    'return kurusaYuvarla(sumProduct.div(sumPercentage));',
    'Agirlikli ortalama tutardir; kurusaYuvarla ile sarili.',
  ],
  [
    ': taban.times(new Decimal(gider.deger)).dividedBy(100),',
    'Gider tutari; cagri kurusaYuvarla(...) icinde.',
  ],
  [
    '? toplamMaliyet.times(new Decimal(yontem.deger)).dividedBy(100)',
    'Oranli kar; cagri kurusaYuvarla(...) icinde.',
  ],

  // --- Tutar URETMEYEN hesaplar ---
  [
    ': row.total.div(grandTotal).times(100);',
    'Satirin toplam icindeki PAY YUZDESI; para degil, gosterim orani.',
  ],
  [
    'if (lowPositive && highPositive) return low.plus(high).div(2);',
    'Etkin pursantaj bir ORANDIR. K-10 oranlari tam hassasiyette tutar; ' +
      'yuvarlanmis oranla bolmek tahmini kaydirirdi.',
  ],
  [
    'sumProduct = sumProduct.plus(row.estimatedCost.times(pct));',
    'Ara toplam; sonuc doner donmez kurusa iniyor.',
  ],
  [
    'const tamPay = kalan.times(satir.maliyet).dividedBy(serbestMaliyet);',
    'Tam pay; hemen ardindan kurusa kirpilip artik en buyuk kalan ' + 'yontemiyle dagitiliyor.',
  ],
  [
    'const adet = artik.abs().dividedBy(kurus).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();',
    'Dagitilacak KURUS ADEDI; tutar degil sayac.',
  ],
  [
    'return miktar.isZero() ? null : teklifTutari.dividedBy(miktar);',
    'Teklif birim fiyati. K-10 birim fiyati kurusa indirmez; en cok 6 ' + 'ondalikla GOSTERILIR.',
  ],
  [
    'sonuc = sonuc === null ? deger : sonuc.times(deger);',
    'Metraj olcularinin carpimi MIKTAR uretir, tutar degil. K-10 kaynak ve ' +
      'kullanici miktarini tam hassasiyette tutar; kurusa yuvarlanmaz.',
  ],
  [
    'const decimalPart = abs.minus(integerPart).times(100).round().toNumber();',
    'Tutari yaziya cevirirken kurus hanesini ayirma; yeni tutar uretmez.',
  ],
]);

function dosyalariTara(kok) {
  const cikti = [];
  const gez = (dizin) => {
    for (const girdi of fs.readdirSync(dizin, { withFileTypes: true })) {
      const tam = path.join(dizin, girdi.name);
      if (girdi.isDirectory()) gez(tam);
      else if (/\.tsx?$/.test(girdi.name)) cikti.push(tam);
    }
  };
  gez(kok);
  return cikti;
}

test('para hesabi eklenirken sozlesme atlanmamis olmali', () => {
  const bulunanlar = [];
  for (const klasor of KLASORLER) {
    for (const dosya of dosyalariTara(klasor)) {
      const goreli = dosya.split(path.sep).join('/');
      if (HARIC.includes(goreli)) continue;
      const satirlar = fs.readFileSync(dosya, 'utf8').split(/\r?\n/);
      satirlar.forEach((satir, i) => {
        if (ARITMETIK.test(satir)) bulunanlar.push({ goreli, no: i + 1, metin: satir.trim() });
      });
    }
  }

  const yeni = bulunanlar.filter((b) => !IZINLI.has(b.metin));
  assert.deepEqual(
    yeni.map((b) => `${b.goreli}:${b.no}  ${b.metin}`),
    [],
    'Gozden gecirilmemis para hesabi bulundu.\n' +
      'Once shared/lib/para.ts islevleri isi goruyor mu bak (satirTutari, ' +
      'kalemlerToplami, kurusaYuvarla). Gormuyorsa satiri tests/para-bekcisi.test.mjs ' +
      'icindeki IZINLI listesine GEREKCESIYLE ekle.',
  );

  // Liste curumesin: artik var olmayan bir satir listede kalmamali.
  const mevcutMetinler = new Set(bulunanlar.map((b) => b.metin));
  const olu = [...IZINLI.keys()].filter((k) => !mevcutMetinler.has(k));
  assert.deepEqual(olu, [], 'IZINLI listesinde artik kodda bulunmayan satirlar var; temizle.');
});
