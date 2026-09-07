'use server';

import { randomUUID } from 'node:crypto';
import { createClient } from '@shared/lib/supabase/server';
import { MAX_PROJECT_BYTES } from './lib/icmal-file';
import { projeAnahtari, projeIndir, projeSil, projeYukle } from './lib/r2';

/**
 * Hesap projeleri: meta veri Postgres'te, icerik R2'de (K-04 karma saklama).
 *
 * Iki kaynagin tutarliligi burada korunur. Sira bilerek secilmistir:
 *
 *  - Yeni projede once Postgres satiri yazilir, cunku KOTA DENETIMI orada
 *    (before-insert tetikleyicisi). Once R2'ye yazsaydik kota reddinde yetim
 *    nesne kalirdi. Satir yazildiktan sonra R2 yazimi basarisiz olursa satir
 *    geri alinir.
 *  - Guncellemede once R2'ye yazilir. Postgres guncellemesi duserse icerik
 *    guncel, ozet eski kalir; bu durumda indirme ozet dogrulamasinda hata
 *    verir, yani tutarsizlik SESSIZ kalmaz ve yeniden kaydetme duzeltir.
 */

type Ozet = { kalemSayisi: number; toplamTutar: string | null; paraBirimi?: string };

/** Sunucu eyleminin sonucu: basari degeriyle ya da okunabilir hata mesajiyla. */
export type Sonuc<T> = { tamam: true; veri: T } | { tamam: false; hata: string };

/**
 * Eylem sinirinda hatayi DEGERE cevirir.
 *
 * Uretim derlemesinde Next atilan hatanin mesajini istemciye vermez; yerine bir
 * "digest" gonderir ve React bunu asgari hata (#441) olarak gunluge yazar.
 * Kullanicinin gordugu tek sey genel bir cumle olur, hatanin ne oldugu kaybolur.
 * Bu yuzden beklenen basarisizliklar -- oturum yok, kota doldu, yapilandirma
 * eksik, R2 yazamadi -- ATILMAZ, dondurulur. Sunucu gunlugune yine tam hali
 * yazilir.
 */
async function sarmala<T>(is: () => Promise<T>): Promise<Sonuc<T>> {
  try {
    return { tamam: true, veri: await is() };
  } catch (hata) {
    console.error('[proje eylemi]', hata);
    return {
      tamam: false,
      hata: hata instanceof Error ? hata.message : 'Beklenmeyen bir hata olustu.',
    };
  }
}

/**
 * Oturumu dogrular ve erisim belirtecini de dondurur.
 *
 * Belirtec gerekli: R2 yetkisi artik `proje-dosyasi` Edge Function'inda; nesne
 * anahtarini o uretiyor ve bunun icin cagiranin kimligini kendisi dogruluyor.
 */
async function oturum() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Bu işlem için giriş yapmalısınız.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Oturum bilgisi okunamadı; yeniden giriş yapın.');
  return { supabase, user, belirtec: session.access_token };
}

async function kotayiOku(): Promise<{ sinir: number; kullanilan: number; kalan: number }> {
  const { supabase } = await oturum();
  const { data, error } = await supabase.rpc('proje_kotasi').single();
  if (error) throw new Error(error.message);
  const r = data as { sinir: number; kullanilan: number; kalan: number };
  return { sinir: r.sinir, kullanilan: r.kullanilan, kalan: r.kalan };
}

async function listeyiOku() {
  const { supabase } = await oturum();
  // RLS zaten sahibe daraltir; siralamayi indeks karsilar.
  const { data, error } = await supabase
    .from('projeler')
    .select('id, ad, kalem_sayisi, toplam_tutar, para_birimi, boyut_bayt, olusturulma_zamani, guncellenme_zamani')
    .order('guncellenme_zamani', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Yeni hesap projesi olusturur. Kota denetimi veritabani tetikleyicisindedir. */
async function olustur(ad: string, bytes: Uint8Array, ozet: Ozet) {
  if (!bytes.length) throw new Error('Bos proje kaydedilemez.');
  if (bytes.length > MAX_PROJECT_BYTES) throw new Error('Proje dosyasi boyut sinirini asiyor.');

  const { supabase, user, belirtec } = await oturum();
  const id = randomUUID();
  const anahtar = projeAnahtari(user.id, id);

  // Once satir: kota reddi burada olusur ve R2'de yetim nesne birakmaz.
  const { error: ekleHatasi } = await supabase.from('projeler').insert({
    id,
    sahip_id: user.id,
    ad: ad.trim(),
    kalem_sayisi: ozet.kalemSayisi,
    toplam_tutar: ozet.toplamTutar,
    para_birimi: ozet.paraBirimi ?? 'TRY',
    depolama_anahtari: anahtar,
    boyut_bayt: bytes.length,
    // Gecici deger; R2 yazimindan sonra gercek ozetle guncellenir.
    icerik_sha256: '0'.repeat(64),
  });
  if (ekleHatasi) throw new Error(ekleHatasi.message);

  try {
    const { sha256 } = await projeYukle(belirtec, user.id, id, bytes);
    const { error: guncelleHatasi } = await supabase
      .from('projeler')
      .update({ icerik_sha256: sha256 })
      .eq('id', id);
    if (guncelleHatasi) throw new Error(guncelleHatasi.message);
    return { id, ad: ad.trim() };
  } catch (hata) {
    // R2 yazimi ya da ozet guncellemesi dustu: yarim kayit birakma.
    await supabase.from('projeler').delete().eq('id', id);
    await projeSil(belirtec, id).catch(() => {});
    throw hata;
  }
}

/** Mevcut projenin uzerine yazar. Surumleme yoktur (K-15). */
async function guncelle(id: string, ad: string, bytes: Uint8Array, ozet: Ozet) {
  if (!bytes.length) throw new Error('Bos proje kaydedilemez.');
  if (bytes.length > MAX_PROJECT_BYTES) throw new Error('Proje dosyasi boyut sinirini asiyor.');

  const { supabase, user, belirtec } = await oturum();
  // RLS zaten sahibe daraltir; bu okuma projenin varligini dogrular.
  const { data: mevcut, error: okumaHatasi } = await supabase
    .from('projeler')
    .select('id')
    .eq('id', id)
    .single();
  if (okumaHatasi || !mevcut) throw new Error('Proje bulunamadı.');

  const { sha256 } = await projeYukle(belirtec, user.id, id, bytes);
  const { error: guncelleHatasi } = await supabase
    .from('projeler')
    .update({
      ad: ad.trim(),
      kalem_sayisi: ozet.kalemSayisi,
      toplam_tutar: ozet.toplamTutar,
      para_birimi: ozet.paraBirimi ?? 'TRY',
      boyut_bayt: bytes.length,
      icerik_sha256: sha256,
    })
    .eq('id', id);
  if (guncelleHatasi) throw new Error(guncelleHatasi.message);
  return { id, ad: ad.trim() };
}

async function ac(id: string): Promise<{ ad: string; bytes: Uint8Array }> {
  const { supabase, belirtec } = await oturum();
  const { data, error } = await supabase
    .from('projeler')
    .select('ad, icerik_sha256')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Proje bulunamadı.');
  // Ozet dogrulamasi projeIndir icinde; bozuk icerik sessizce acilmaz.
  const bytes = await projeIndir(belirtec, id, data.icerik_sha256);
  return { ad: data.ad, bytes };
}

/**
 * Projeyi siler. K-15: silme bir hak acar, geri alinamaz. Once satir silinir
 * ki hak hemen acilsin; R2 nesnesi ardindan temizlenir.
 */
async function sil(id: string) {
  const { supabase, belirtec } = await oturum();
  const { data, error } = await supabase
    .from('projeler')
    .select('id')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Proje bulunamadı.');

  const { error: silmeHatasi } = await supabase.from('projeler').delete().eq('id', id);
  if (silmeHatasi) throw new Error(silmeHatasi.message);

  // Nesne silinemezse kayit yine de gitmistir; yetim nesne kullaniciyi
  // engellemez ve kota hakki acilmis olur.
  await projeSil(belirtec, id).catch(() => {});
  return { id };
}

// --- Eylem siniri -----------------------------------------------------------
// Istemcinin gordugu yuzey burasidir. Yukaridaki islevler hata ATAR; asagidaki
// disa acilan eylemler o hatayi mesaja cevirir (bkz. `sarmala`).

export async function projeKotasi() {
  return sarmala(kotayiOku);
}

export async function projeleriListele() {
  return sarmala(listeyiOku);
}

export async function projeOlustur(ad: string, bytes: Uint8Array, ozet: Ozet) {
  return sarmala(() => olustur(ad, bytes, ozet));
}

export async function projeGuncelle(id: string, ad: string, bytes: Uint8Array, ozet: Ozet) {
  return sarmala(() => guncelle(id, ad, bytes, ozet));
}

export async function projeAc(id: string) {
  return sarmala(() => ac(id));
}

export async function projeyiSil(id: string) {
  return sarmala(() => sil(id));
}
