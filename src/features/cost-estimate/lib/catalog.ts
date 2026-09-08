import Decimal from 'decimal.js';
import { farkliFiyatBirimi } from '../../../shared/lib/fiyat-sunumu.ts';
import { z } from 'zod';

const priceSchema = z.object({
  id: z.string().optional().nullable(),
  fiyat_turu: z.string(),
  tutar: z.union([z.string(), z.number()]),
  para_birimi_kodu: z.string(),
  birim_ham: z.string().nullable().optional(),
});
const rowSchema = z.object({
  poz_surumu_id: z.string(),
  poz_numarasi: z.string(),
  tanim: z.string(),
  kurum_kodu: z.string(),
  kitap_adi: z.string(),
  donem: z.string(),
  birim: z.string().nullable(),
  fiyatlar: z.array(priceSchema).nullable(),
  kaynak_url: z.string().nullable().optional(),
  kaynak_sayfa: z.number().nullable().optional(),
});

export interface CatalogSource {
  versionId: string;
  priceId: string | null;
  priceType: string;
  priceAmount: string;
  currency: string;
  unit: string;
  institution: string;
  period: string;
  book: string;
  url: string | null;
  page: number | null;
}
export interface CatalogEntry {
  key: string;
  pozNo: string;
  description: string;
  unit: string;
  unitPrice: Decimal;
  institution: string;
  source: CatalogSource;
  /**
   * Yalniz fiyatin birimi POZ birimînden farkliysa dolu olur; pozun kendi
   * birimini tasir. Dolu olmasi "dikkat, donusum yapilmadi" demektir.
   */
  pozBirimi?: string | null;
}
// Etiket sozlugu ortak modulde; burada kopyasi tutulmuyordu ve
// alternate_unit_price eksikti (TEMEL-04).
export { fiyatEtiketi } from '../../../shared/lib/fiyat-sunumu.ts';

export function catalogEntries(data: unknown): CatalogEntry[] {
  const rows = z.array(rowSchema).parse(data);
  const entries = new Map<string, CatalogEntry>();
  for (const row of rows) {
    for (const price of row.fiyatlar ?? []) {
      // Cost screens currently calculate in TRY; never silently mix currencies.
      if (price.para_birimi_kodu !== 'TRY') continue;
      const unit = price.birim_ham?.trim() || row.birim?.trim();
      // Fiyat kendi biriminde; poz baska birimle olculuyorsa DONUSUM YAPILMAZ,
      // kullaniciya soylenir (K-09 / TEMEL-04). Canli veride 98 satir boyle.
      const farkliBirim = farkliFiyatBirimi(price.birim_ham, row.birim);
      if (!unit || String(price.tutar).trim() === '') continue;
      let amount: Decimal;
      try {
        amount = new Decimal(price.tutar);
      } catch {
        continue;
      }
      if (!amount.isFinite()) continue;
      const source: CatalogSource = {
        versionId: row.poz_surumu_id,
        priceId: price.id ?? null,
        priceType: price.fiyat_turu,
        priceAmount: amount.toString(),
        currency: 'TRY',
        unit,
        institution: row.kurum_kodu,
        period: row.donem,
        book: row.kitap_adi,
        url: row.kaynak_url ?? null,
        page: row.kaynak_sayfa ?? null,
      };
      const key = JSON.stringify([
        source.versionId,
        source.priceId,
        source.priceType,
        unit,
        source.priceAmount,
        source.currency,
      ]);
      entries.set(key, {
        key,
        pozNo: row.poz_numarasi,
        description: row.tanim,
        unit,
        unitPrice: amount,
        institution: row.kurum_kodu,
        source,
        ...(farkliBirim ? { pozBirimi: row.birim?.trim() || null } : {}),
      });
    }
  }
  return [...entries.values()];
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
