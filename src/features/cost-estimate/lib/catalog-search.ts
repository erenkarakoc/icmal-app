import { createClient } from '@shared/lib/supabase/client';
import { catalogEntries, escapeLike } from './catalog';

export type CatalogSearchField = 'poz_numarasi' | 'tanim';
export async function searchCatalog(
  query: string,
  signal: AbortSignal,
  field: CatalogSearchField = 'poz_numarasi',
) {
  const client = createClient();
  const timeout = AbortSignal.timeout(8000);
  const cancel = new AbortController();
  const requestSignal = AbortSignal.any([signal, timeout, cancel.signal]);
  const term = `%${escapeLike(query.trim())}%`;
  const fields =
    'poz_surumu_id,poz_numarasi,tanim,kurum_kodu,kitap_adi,donem,birim,fiyatlar,kaynak_url,kaynak_sayfa';
  let stage = 'aday araması';
  let rightsComplete = false;
  async function findLegacyRows() {
    const normalized =
      field === 'poz_numarasi'
        ? query.normalize('NFC').replace(/\s+/g, '').toUpperCase()
        : query.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
    // These normalized columns already have trigram indexes. The detail view's
    // computed description cannot use those indexes directly.
    const candidates =
      field === 'poz_numarasi'
        ? await client
            .from('pozlar')
            .select('id')
            .ilike('kod_normalize', `%${escapeLike(normalized)}%`)
            .limit(20)
            .abortSignal(requestSignal)
        : await client
            .from('poz_surumleri')
            .select('id')
            .ilike('tanim_normalize', `%${escapeLike(normalized)}%`)
            .limit(20)
            .abortSignal(requestSignal);
    if (candidates.error || requestSignal.aborted) return candidates;
    const ids = (candidates.data ?? []).map((row) => row.id);
    stage = 'fiyat ayrıntıları';
    if (ids.length) {
      const details = await client
        .from('v_poz_detay')
        .select(fields)
        .in(field === 'poz_numarasi' ? 'poz_id' : 'poz_surumu_id', ids)
        .ilike(field, term)
        .order('poz_numarasi')
        .order('poz_surumu_id')
        .limit(20)
        .abortSignal(requestSignal);
      if (details.error || details.data?.length || requestSignal.aborted) return details;
    }
    // An approved description correction can match even when the source does not.
    // Keep that path for searches without current indexed matches.
    if (field === 'tanim') {
      stage = 'düzeltilmiş tanım araması';
      const corrected = await client
        .from('v_poz_detay')
        .select('poz_surumu_id')
        .ilike('tanim', term)
        .limit(20)
        .abortSignal(requestSignal);
      if (corrected.error || !corrected.data?.length || requestSignal.aborted) return corrected;
      stage = 'fiyat ayrıntıları';
      return client
        .from('v_poz_detay')
        .select(fields)
        .in(
          'poz_surumu_id',
          corrected.data.map((row) => row.poz_surumu_id),
        )
        .order('poz_numarasi')
        .order('poz_surumu_id')
        .abortSignal(requestSignal);
    }
    return { ...candidates, data: [] };
  }
  async function findRows() {
    const candidates = await client
      .rpc('katalog_poz_adaylari', {
        p_arama: query.trim(),
        p_alan: field,
        p_limit: 20,
      })
      .abortSignal(requestSignal);
    // Compatible rollout: keep the existing path until the migration is installed.
    // Never bypass a permission/timeout error via this fallback.
    if (candidates.error?.code === 'PGRST202') return findLegacyRows();
    if (candidates.error || requestSignal.aborted) return candidates;
    const data: unknown = candidates.data;
    if (!Array.isArray(data) || data.some((row) => !row || typeof row.poz_surumu_id !== 'string')) {
      throw new Error('Katalog adayları beklenen biçimde değil.');
    }
    if (!data.length) return { ...candidates, data: [] };
    stage = 'fiyat ayrıntıları';
    return client
      .from('v_poz_detay')
      .select(fields)
      .in(
        'poz_surumu_id',
        data.map((row) => row.poz_surumu_id),
      )
      .order('poz_numarasi')
      .order('poz_surumu_id')
      .abortSignal(requestSignal);
  }
  const [rights, response] = await Promise.all([
    Promise.all(
      ['poz_temel', 'poz_fiyatlar'].map((code) =>
        client.rpc('ozellige_erisim_var_mi', { p_ozellik_kodu: code }).abortSignal(requestSignal),
      ),
    ).then((result) => {
      rightsComplete = true;
      if (requestSignal.aborted) return result;
      if (result.some((item) => item.error?.code === '42501'))
        throw new Error('Katalog erişim izni bulunamadı. Hesap yetkileri kontrol edilmeli.');
      if (result.some((item) => item.status === 401))
        throw new Error('Katalog oturumu doğrulanamadı. Yeniden giriş yapın.');
      if (result.some((item) => item.error))
        throw new Error('Katalog erişimi doğrulanamadı. Tekrar deneyin.');
      if (result.some((item) => item.data !== true))
        throw new Error('Poz ve fiyat erişimi için üyelik yetkisi gerekiyor.');
      return result;
    }),
    findRows(),
  ]).catch((error) => {
    cancel.abort();
    throw error;
  });
  if (signal.aborted) return [];
  if (timeout.aborted)
    throw new Error(
      `Katalog ${rightsComplete ? stage : 'erişim kontrolü'} zamanında tamamlanamadı. Tekrar deneyin.`,
    );
  if (response.error?.code === '42501' || rights.some((result) => result.error?.code === '42501'))
    throw new Error('Katalog erişim izni bulunamadı. Hesap yetkileri kontrol edilmeli.');
  if (response.status === 401 || rights.some((result) => result.status === 401))
    throw new Error('Katalog oturumu doğrulanamadı. Yeniden giriş yapın.');
  if (rights.some((result) => result.error))
    throw new Error('Katalog erişimi doğrulanamadı. Tekrar deneyin.');
  if (rights.some((result) => result.data !== true))
    throw new Error('Poz ve fiyat erişimi için üyelik yetkisi gerekiyor.');
  if (response.error)
    throw new Error('Katalog yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
  try {
    return catalogEntries(response.data ?? []);
  } catch {
    throw new Error('Katalog verisi beklenen biçimde değil. Lütfen tekrar deneyin.');
  }
}
