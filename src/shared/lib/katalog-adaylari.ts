import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeLike } from '@features/cost-estimate/lib/catalog';

/**
 * Katalogda aday poz sürümü kimliklerini bulur.
 *
 * NEDEN AYRI BİR ADIM: `v_poz_detay` bir görünümdür ve üzerinde baştan joker'li
 * `ilike` **indeks kullanamaz** — 2026-09-06 ölçümünde bu biçim 12.781 ms sürüp
 * Seq Scan'e düşmüş, istemci tarafında zaman aşımı vermişti. Bu yüzden önce
 * indeksli kolonlardan (`pozlar.kod_normalize`, `poz_surumleri.tanim_normalize`)
 * dar bir aday kümesi çıkarılır; ayrıntılar ancak o kimliklerle çekilir.
 *
 * Arama **sınırlı bir öneri listesidir**, tam tarama değildir: sunucudaki RPC
 * `p_limit` değerini 20 ile sınırlar ve buradan daha fazlası istenemez.
 *
 * Bu modül iki ekran tarafından kullanılır (maliyet seçicisi ve birim fiyat
 * sayfası). Mantık tek yerde durur; daha önce yalnız maliyet ekranına
 * uygulandığı için birim fiyat sayfası aynı zaman aşımını yaşamaya devam
 * etmişti.
 */

export type AramaAlani = 'poz_numarasi' | 'tanim';

/** Sunucudaki RPC'nin üst sınırı; burada büyütmek bir şey değiştirmez. */
export const ADAY_SINIRI = 20;

type Istemci = SupabaseClient;

function normalize(arama: string, alan: AramaAlani): string {
  return alan === 'poz_numarasi'
    ? arama.normalize('NFC').replace(/\s+/g, '').toUpperCase()
    : arama.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Migration yüklenmemişse eski yol. Yetki/zaman aşımı hataları BU YOLA
 * DÜŞMEZ; yalnız "fonksiyon yok" (PGRST202) durumunda kullanılır, aksi halde
 * bir erişim hatası sessizce farklı bir sorguya çevrilmiş olurdu.
 */
async function indeksliAdaylar(
  istemci: Istemci,
  arama: string,
  alan: AramaAlani,
  signal: AbortSignal,
): Promise<Adaylar> {
  const desen = `%${escapeLike(normalize(arama, alan))}%`;
  // Kod aramasinda indeksli kolon `pozlar` uzerindedir ve POZ kimligi verir;
  // tanim aramasinda `poz_surumleri` uzerindedir ve SURUM kimligi verir. Bu
  // yuzden hangi kolonda filtrelenecegi de birlikte donuyor.
  const sonuc =
    alan === 'poz_numarasi'
      ? await istemci
          .from('pozlar')
          .select('id')
          .ilike('kod_normalize', desen)
          .limit(ADAY_SINIRI)
          .abortSignal(signal)
      : await istemci
          .from('poz_surumleri')
          .select('id')
          .ilike('tanim_normalize', desen)
          .limit(ADAY_SINIRI)
          .abortSignal(signal);

  if (sonuc.error) return { kimlikler: [], kolon: 'poz_surumu_id', error: sonuc.error };

  const kimlikler = ((sonuc.data ?? []) as { id?: unknown }[])
    .map((satir) => satir?.id)
    .filter((id): id is string => typeof id === 'string');

  return {
    kimlikler,
    kolon: alan === 'poz_numarasi' ? 'poz_id' : 'poz_surumu_id',
    error: null,
  };
}

export type Adaylar = {
  kimlikler: string[];
  /** `v_poz_detay` bu kolonda daraltılmalı. */
  kolon: 'poz_surumu_id' | 'poz_id';
  error: unknown;
};

/**
 * Aday kimlikleri döndürür. Hata ATMAZ; çağıran hatayı kendi arayüz
 * sözleşmesine göre yorumlar (yetki reddi, oturum, zaman aşımı ayrı ayrı).
 */
export async function pozAdaylari(
  istemci: Istemci,
  arama: string,
  alan: AramaAlani,
  signal: AbortSignal,
): Promise<Adaylar> {
  if (arama.trim().length < 2) return { kimlikler: [], kolon: 'poz_surumu_id', error: null };

  const sonuc = await istemci
    .rpc('katalog_poz_adaylari', { p_arama: arama.trim(), p_alan: alan, p_limit: ADAY_SINIRI })
    .abortSignal(signal);

  const kod = (sonuc.error as { code?: string } | null)?.code;
  // Yalniz "fonksiyon yok" eski yola duser; yetki/zaman asimi hatasi duserse
  // erisim reddi sessizce baska bir sorguya cevrilmis olurdu.
  if (kod === 'PGRST202') return indeksliAdaylar(istemci, arama, alan, signal);
  if (sonuc.error) return { kimlikler: [], kolon: 'poz_surumu_id', error: sonuc.error };

  const veri: unknown = sonuc.data;
  const bozuk = (): Adaylar => ({
    kimlikler: [],
    kolon: 'poz_surumu_id',
    error: new Error('Katalog adayları beklenen biçimde değil.'),
  });
  if (!Array.isArray(veri)) return bozuk();

  const kimlikler: string[] = [];
  for (const satir of veri as { poz_surumu_id?: unknown }[]) {
    if (typeof satir?.poz_surumu_id !== 'string') return bozuk();
    kimlikler.push(satir.poz_surumu_id);
  }
  return { kimlikler, kolon: 'poz_surumu_id', error: null };
}
