'use client';

import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Trash2 } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { useProjectSession } from './project-session';
import { giderleriHesapla, giderToplami, toplamMaliyet, GiderDongusuHatasi } from '../lib/giderler';
import type { Gider } from '../lib/giderler';

/**
 * Proje giderleri paneli (K-06 · Soru 5-6).
 *
 * Karar iki şeyi açıkça istiyor: her yüzdeli gider için **oran, taban tutarı ve
 * tabana dahil edilen giderler** görünsün; ve **iş kalemleri toplamı, ek
 * giderler, toplam maliyet ayrı ayrı** gösterilsin.
 *
 * Örnek gider adları ve oranlar varsayılan olarak sunulmaz — karar bunu açıkça
 * dışarıda bırakıyor ("örnek gider adları zorunlu liste, örnek oranlar otomatik
 * varsayılan değildir").
 */
export function ExpensesPanel({ kalemToplami }: { kalemToplami: Decimal }) {
  const { giderler, setGiderler } = useProjectSession();
  const [ad, setAd] = useState('');

  const hesap = useMemo(() => {
    try {
      const sonuclar = giderleriHesapla(kalemToplami, giderler);
      return { sonuclar, hata: null as string | null };
    } catch (e) {
      // Döngüsel taban hesabı tanımsız kılar; sayı uydurmak yerine sebebi söylenir.
      return {
        sonuclar: [],
        hata:
          e instanceof GiderDongusuHatasi
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Giderler hesaplanamadı.',
      };
    }
  }, [kalemToplami, giderler]);

  const guncelle = (id: string, degisiklik: Partial<Gider>) =>
    setGiderler((liste) => liste.map((g) => (g.id === id ? { ...g, ...degisiklik } : g)));

  const ekle = (tur: Gider['tur']) => {
    const temiz = ad.trim();
    if (!temiz) return;
    setGiderler((liste) => [...liste, { id: crypto.randomUUID(), ad: temiz, tur, deger: '0' }]);
    setAd('');
  };

  const tabanDegistir = (gider: Gider, hedefId: string, dahil: boolean) => {
    const mevcut = gider.tabanGiderleri ?? [];
    guncelle(gider.id, {
      tabanGiderleri: dahil ? [...mevcut, hedefId] : mevcut.filter((x) => x !== hedefId),
    });
  };

  const tl = (d: Decimal) => d.toFixed(2);
  const toplam = hesap.hata ? null : toplamMaliyet(kalemToplami, hesap.sonuclar);

  return (
    <section className="mt-6 rounded-md border p-4" data-project-editor>
      <h2 className="mb-3 text-sm font-medium">Giderler</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          placeholder="Gider adı"
          value={ad}
          maxLength={200}
          onChange={(e) => setAd(e.target.value)}
        />
        <Button variant="outline" size="sm" disabled={!ad.trim()} onClick={() => ekle('tutar')}>
          Tutar ekle
        </Button>
        <Button variant="outline" size="sm" disabled={!ad.trim()} onClick={() => ekle('yuzde')}>
          Yüzde ekle
        </Button>
      </div>

      {hesap.hata && (
        <p role="alert" className="text-destructive mb-3 text-sm">
          {hesap.hata}
        </p>
      )}

      {giderler.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Gider eklenmedi. Toplam maliyet iş kalemleri toplamına eşittir.
        </p>
      ) : (
        <ul className="divide-y">
          {giderler.map((g) => {
            const sonuc = hesap.sonuclar.find((s) => s.id === g.id);
            const digerleri = giderler.filter((x) => x.id !== g.id);
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                <Input
                  className="w-48"
                  value={g.ad}
                  maxLength={200}
                  onChange={(e) => guncelle(g.id, { ad: e.target.value })}
                />
                <Input
                  className="w-28"
                  inputMode="decimal"
                  value={g.deger}
                  onChange={(e) => guncelle(g.id, { deger: e.target.value })}
                />
                <span className="text-muted-foreground text-xs">
                  {g.tur === 'yuzde' ? '%' : 'TL'}
                </span>

                {g.tur === 'yuzde' && digerleri.length > 0 && (
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Tabana ekle:</span>
                    {digerleri.map((d) => (
                      <label key={d.id} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={(g.tabanGiderleri ?? []).includes(d.id)}
                          onChange={(e) => tabanDegistir(g, d.id, e.target.checked)}
                        />
                        {d.ad}
                      </label>
                    ))}
                  </span>
                )}

                <span className="text-muted-foreground ml-auto text-xs">
                  {g.tur === 'yuzde' && sonuc && `taban ${tl(sonuc.taban)} · `}
                  {sonuc ? `${tl(sonuc.tutar)} TL` : '—'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${g.ad} giderini kaldır`}
                  onClick={() => setGiderler((liste) => liste.filter((x) => x.id !== g.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="mt-4 space-y-1 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">İş kalemleri toplamı</dt>
          <dd>{tl(kalemToplami)} TL</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Ek giderler</dt>
          <dd>{hesap.hata ? '—' : `${tl(giderToplami(hesap.sonuclar))} TL`}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>Toplam maliyet</dt>
          <dd>{toplam ? `${tl(toplam)} TL` : '—'}</dd>
        </div>
      </dl>
    </section>
  );
}
