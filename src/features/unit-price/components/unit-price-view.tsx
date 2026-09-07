'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Building2, CalendarDays, Loader2, LockKeyhole, Search } from 'lucide-react';

import { createClient } from '@shared/lib/supabase/client';
import { pozAdaylari } from '@shared/lib/katalog-adaylari';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Input } from '@shared/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shared/components/ui/table';

interface PozFiyati {
  fiyat_turu: string;
  tutar: number;
  para_birimi_kodu: string;
}

interface PozDetayi {
  poz_id: string;
  poz_surumu_id: string;
  kurum_kodu: string;
  kurum_adi: string;
  kitap_adi: string;
  fasikul_adi: string | null;
  poz_numarasi: string;
  eski_poz_numarasi: string | null;
  tanim: string;
  birim: string | null;
  kategori: string | null;
  alt_kategori: string | null;
  poz_turu: string;
  donem: string;
  fiyatlar: PozFiyati[] | null;
  tarif: string | null;
  analiz_satiri_sayisi: number | null;
  kaynak_url: string;
  kaynak_sayfa: number;
}

function fiyatEtiketi(tur: string) {
  if (tur === 'unit_price') return 'Birim fiyat';
  if (tur === 'montage_price') return 'Montaj';
  if (tur === 'demontage_price') return 'Demontaj';
  if (tur === 'rayic') return 'Rayiç';
  return tur;
}

function para(tutar: number, kod: string) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: kod,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(tutar));
}

export function UnitPriceView() {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [sonuclar, setSonuclar] = useState<PozDetayi[]>([]);
  const [secili, setSecili] = useState<PozDetayi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [temelErisim, setTemelErisim] = useState<boolean | null>(null);
  const [fiyatErisim, setFiyatErisim] = useState(false);
  const [analizErisim, setAnalizErisim] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let etkin = true;
    Promise.all([
      supabase.rpc('ozellige_erisim_var_mi', { p_ozellik_kodu: 'poz_temel' }),
      supabase.rpc('ozellige_erisim_var_mi', { p_ozellik_kodu: 'poz_fiyatlar' }),
      supabase.rpc('ozellige_erisim_var_mi', { p_ozellik_kodu: 'poz_analizleri' }),
    ]).then(([temel, fiyat, analiz]) => {
      if (!etkin) return;
      setTemelErisim(Boolean(temel.data));
      setFiyatErisim(Boolean(fiyat.data));
      setAnalizErisim(Boolean(analiz.data));
    });
    return () => {
      etkin = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!temelErisim || query.trim().length < 2) {
      return;
    }
    const iptal = new AbortController();
    const zamanlayici = window.setTimeout(async () => {
      setYukleniyor(true);
      setHata(null);
      const arama = query.trim();
      // 8 sn: maliyet seçicisiyle aynı sözleşme. Sunucu tarafı zaman aşımı
      // ham Postgres cümlesi olarak kullanıcıya çıkmasın.
      const zamanAsimi = AbortSignal.timeout(8000);
      const signal = AbortSignal.any([iptal.signal, zamanAsimi]);

      try {
        // Görünüm üzerinde baştan joker'li `ilike` indeks kullanamaz ve zaman
        // aşımına düşer. Önce indeksli kolonlardan dar aday kümesi alınır.
        const [kod, tanim] = await Promise.all([
          pozAdaylari(supabase, arama, 'poz_numarasi', signal),
          pozAdaylari(supabase, arama, 'tanim', signal),
        ]);
        const adayHatasi = kod.error ?? tanim.error;
        if (adayHatasi) throw adayHatasi;

        const birlesik = new Map<string, PozDetayi>();
        const gruplar = [kod, tanim].filter((g) => g.kimlikler.length);
        const sonuclar = await Promise.all(
          gruplar.map((g) =>
            supabase
              .from('v_poz_detay')
              .select('*')
              .in(g.kolon, g.kimlikler)
              .order('poz_numarasi')
              .order('poz_surumu_id')
              .limit(100)
              .abortSignal(signal),
          ),
        );
        for (const sonuc of sonuclar) {
          if (sonuc.error) throw sonuc.error;
          for (const satir of (sonuc.data ?? []) as PozDetayi[]) {
            birlesik.set(satir.poz_surumu_id, satir);
          }
        }
        if (iptal.signal.aborted) return;
        setSonuclar([...birlesik.values()]);
      } catch (e) {
        if (iptal.signal.aborted) return;
        // Aşamayı ayırmak önemli: yetki reddi yavaş sorgudan bağımsızdır.
        const kodu = (e as { code?: string } | null)?.code;
        if (zamanAsimi.aborted) setHata('Katalog araması zamanında tamamlanamadı. Tekrar deneyin.');
        else if (kodu === '42501')
          setHata('Katalog erişim izni bulunamadı. Hesap yetkileri kontrol edilmeli.');
        else setHata('Katalog yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
        setSonuclar([]);
      } finally {
        if (!iptal.signal.aborted) setYukleniyor(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(zamanlayici);
      // Eski istek yeni sonuçları ezmesin.
      iptal.abort();
    };
  }, [query, temelErisim, supabase]);

  if (temelErisim === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!temelErisim) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <div className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-full">
              <LockKeyhole className="size-5" />
            </div>
            <CardTitle>Poz verisi paketinizde kapalı</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Admin henüz paketiniz için “Poz temel bilgileri” özelliğini açmamış olabilir.
              Paketleri ve ödeme durumunuzu üyelik ekranından inceleyebilirsiniz.
            </p>
            <Button asChild>
              <Link href="/uyelik">Üyelik seçeneklerini görüntüle</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="bg-muted/20 border-b px-4 py-3">
        <div className="relative mx-auto max-w-2xl">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label="Poz ara"
            placeholder="Poz numarası veya en az iki karakterli açıklama…"
            className="bg-background h-10 pr-10 pl-9"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) {
                setSonuclar([]);
                setSecili(null);
              }
            }}
          />
          {yukleniyor && (
            <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
          )}
        </div>
      </div>

      {hata && (
        <div role="alert" className="bg-destructive/10 text-destructive border-b px-4 py-2 text-sm">
          Veri okunamadı: {hata}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className={`${secili ? 'w-1/2' : 'w-full'} overflow-auto border-r`}>
          {query.trim().length < 2 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Aramak için en az iki karakter yazın.
            </div>
          ) : !yukleniyor && sonuclar.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Sonuç bulunamadı.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Poz</TableHead>
                  <TableHead>Tanım</TableHead>
                  <TableHead className="w-20">Birim</TableHead>
                  <TableHead className="w-36 text-right">Birim fiyat</TableHead>
                  <TableHead className="w-28">Dönem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sonuclar.map((poz) => {
                  const birimFiyat = poz.fiyatlar?.find(
                    (fiyat) => fiyat.fiyat_turu === 'unit_price',
                  );
                  return (
                    <TableRow
                      key={poz.poz_surumu_id}
                      className="cursor-pointer"
                      data-state={
                        secili?.poz_surumu_id === poz.poz_surumu_id ? 'selected' : undefined
                      }
                      onClick={() => setSecili(poz)}
                    >
                      <TableCell className="font-mono text-xs">{poz.poz_numarasi}</TableCell>
                      <TableCell className="text-sm">{poz.tanim}</TableCell>
                      <TableCell className="text-xs">{poz.birim || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fiyatErisim && birimFiyat ? (
                          para(birimFiyat.tutar, birimFiyat.para_birimi_kodu)
                        ) : (
                          <LockKeyhole className="text-muted-foreground ml-auto size-3.5" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{poz.donem}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {secili && (
          <aside className="w-1/2 overflow-y-auto p-5">
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge>{secili.poz_numarasi}</Badge>
                  <Badge variant="outline">{secili.poz_turu}</Badge>
                </div>
                <h2 className="text-xl font-semibold">{secili.tanim}</h2>
                {secili.eski_poz_numarasi && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Eski poz: {secili.eski_poz_numarasi}
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <OzetKart
                  icon={<Building2 className="text-muted-foreground size-4" />}
                  baslik={secili.kurum_adi}
                  alt={secili.kurum_kodu}
                />
                <OzetKart
                  icon={<BookOpen className="text-muted-foreground size-4" />}
                  baslik={secili.kitap_adi}
                  alt={secili.fasikul_adi || 'Fasikül belirtilmemiş'}
                />
                <OzetKart
                  icon={<CalendarDays className="text-muted-foreground size-4" />}
                  baslik={secili.donem}
                  alt={`Kaynak sayfa ${secili.kaynak_sayfa}`}
                />
                <OzetKart
                  baslik={secili.birim || 'Birim belirtilmemiş'}
                  alt={
                    [secili.kategori, secili.alt_kategori].filter(Boolean).join(' / ') ||
                    'Kategori yok'
                  }
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Fiyatlar</CardTitle>
                </CardHeader>
                <CardContent>
                  {fiyatErisim ? (
                    secili.fiyatlar?.length ? (
                      <div className="space-y-2">
                        {secili.fiyatlar.map((fiyat) => (
                          <div
                            key={`${fiyat.fiyat_turu}-${fiyat.para_birimi_kodu}`}
                            className="flex items-center justify-between rounded-md border p-3"
                          >
                            <span className="text-sm">{fiyatEtiketi(fiyat.fiyat_turu)}</span>
                            <span className="font-mono text-sm font-semibold">
                              {para(fiyat.tutar, fiyat.para_birimi_kodu)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Bu sürüm için fiyat bulunamadı.
                      </p>
                    )
                  ) : (
                    <KilitliBolum metin="Fiyatları görüntülemek için paketinizde Poz fiyatları özelliği bulunmalıdır." />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tarif ve analiz</CardTitle>
                </CardHeader>
                <CardContent>
                  {analizErisim ? (
                    <div className="space-y-3 text-sm">
                      {secili.tarif ? (
                        <p className="whitespace-pre-wrap">{secili.tarif}</p>
                      ) : (
                        <p className="text-muted-foreground">Tarif bulunamadı.</p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        Analiz satırı: {secili.analiz_satiri_sayisi ?? 0}
                      </p>
                    </div>
                  ) : (
                    <KilitliBolum metin="Tarif, endeks ve analizler paketinizde kapalı." />
                  )}
                </CardContent>
              </Card>
              <Button variant="outline" size="sm" asChild>
                <a href={secili.kaynak_url} target="_blank" rel="noreferrer">
                  Resmî kaynağı aç
                </a>
              </Button>
            </div>
          </aside>
        )}
      </div>
      <div className="bg-muted/40 flex shrink-0 items-center justify-between border-t px-4 py-1.5 text-xs">
        <span className="text-muted-foreground">
          {sonuclar.length ? `${sonuclar.length} sonuç` : ''}
        </span>
        <span className="text-muted-foreground">
          Veriler resmî yayın ve dönem bilgisiyle saklanır.
        </span>
      </div>
    </div>
  );
}

function OzetKart({ icon, baslik, alt }: { icon?: React.ReactNode; baslik: string; alt: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        {icon}
        <p className="mt-2 text-sm font-medium">{baslik}</p>
        <p className="text-muted-foreground text-xs">{alt}</p>
      </CardContent>
    </Card>
  );
}

function KilitliBolum({ metin }: { metin: string }) {
  return (
    <div className="bg-muted/40 flex items-start gap-2 rounded-md border p-3">
      <LockKeyhole className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div>
        <p className="text-muted-foreground text-sm">{metin}</p>
        <Button variant="link" size="sm" className="h-auto px-0" asChild>
          <Link href="/uyelik">Paketleri incele</Link>
        </Button>
      </div>
    </div>
  );
}
