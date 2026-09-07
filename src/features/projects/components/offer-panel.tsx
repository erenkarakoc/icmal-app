'use client';

import { useMemo } from 'react';
import Decimal from 'decimal.js';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { useProjectSession } from './project-session';
import { karHesapla, teklifiDagit, teklifBirimFiyati } from '../lib/teklif';
import { gorunumDegeri } from '@shared/lib/para';
import type { KarYontemi, TeklifKalemi } from '../lib/teklif';
import type { CostRow } from '../../cost-estimate/types';

const YONTEMLER: { tur: KarYontemi['tur']; etiket: string; birim: string }[] = [
  { tur: 'oran', etiket: 'Maliyete oran', birim: '%' },
  { tur: 'sabit', etiket: 'Maliyete sabit kâr', birim: 'TL' },
  { tur: 'hedefTeklif', etiket: 'Hedef teklif', birim: 'TL' },
];

/**
 * Kâr ve teklif paneli (K-06 · Soru 7-8).
 *
 * Karar üç şeyi açıkça istiyor: **etkin yöntem açıkça gösterilsin**, **sabit ve
 * otomatik kalemler ayırt edilsin**, ve uyumsuzlukta **sabit fiyat ya da teklif
 * hedefi sessizce değiştirilmesin** — fark gösterilip düzeltme istensin.
 *
 * İki kâr yöntemi aynı anda uygulanmaz; seçim tekildir, bu yüzden yöntem
 * değiştirmek önceki değeri devralmaz.
 */
export function OfferPanel({ toplamMaliyet, rows }: { toplamMaliyet: Decimal; rows: CostRow[] }) {
  const { teklifYontemi, setTeklifYontemi, sabitTeklifler, setSabitTeklifler } =
    useProjectSession();

  const hesap = useMemo(() => {
    if (!teklifYontemi) return null;
    const kar = karHesapla(toplamMaliyet, teklifYontemi);
    const kalemler: TeklifKalemi[] = rows.map((r) => ({
      id: r.id,
      maliyet: r.total,
      ...(sabitTeklifler[r.id] !== undefined
        ? { sabitTutar: new Decimal(sabitTeklifler[r.id] || '0') }
        : {}),
    }));
    return { kar, dagitim: teklifiDagit(kalemler, kar.teklif) };
  }, [toplamMaliyet, rows, teklifYontemi, sabitTeklifler]);

  const tl = (d: Decimal) => d.toFixed(2);

  /**
   * Birim fiyat tutar değildir: K-10 normal görünümde en çok 6 ondalık ister.
   * Kuruşa indirmek dağıtımdan çıkan birim fiyatı anlamsızlaştırırdı — 33,34 TL
   * / 7 adet gibi bir kalemde 4,76 ile 4,762857 arasındaki fark kaybolurdu.
   */
  const birimGoster = (d: Decimal) => gorunumDegeri(d).toString().replace('.', ',');

  const sabitle = (row: CostRow, tutar: Decimal) =>
    setSabitTeklifler((s) => ({ ...s, [row.id]: tutar.toFixed(2) }));

  const sabitiKaldir = (row: CostRow) =>
    setSabitTeklifler((s) => {
      const kopya = { ...s };
      delete kopya[row.id];
      return kopya;
    });

  return (
    <section className="mt-6 rounded-md border p-4" data-project-editor>
      <h2 className="mb-3 text-sm font-medium">Kâr ve teklif</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {YONTEMLER.map((y) => (
          <Button
            key={y.tur}
            variant={teklifYontemi?.tur === y.tur ? 'default' : 'outline'}
            size="sm"
            onClick={() =>
              // Yöntem tekildir: seçim değişince önceki değer devralınmaz,
              // böylece kâr iki yöntemden birden hesaplanmış olmaz.
              setTeklifYontemi(teklifYontemi?.tur === y.tur ? null : { tur: y.tur, deger: '0' })
            }
          >
            {y.etiket}
          </Button>
        ))}
        {teklifYontemi && (
          <>
            <Input
              className="w-32"
              inputMode="decimal"
              value={teklifYontemi.deger}
              onChange={(e) => setTeklifYontemi({ ...teklifYontemi, deger: e.target.value })}
            />
            <span className="text-muted-foreground text-xs">
              {YONTEMLER.find((y) => y.tur === teklifYontemi.tur)?.birim}
            </span>
          </>
        )}
      </div>

      {!teklifYontemi ? (
        <p className="text-muted-foreground text-sm">
          Kâr yöntemi seçilmedi. Teklif hesaplanmaz, toplam maliyet {tl(toplamMaliyet)} TL olarak
          kalır.
        </p>
      ) : (
        <>
          <dl className="mb-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Toplam maliyet</dt>
              <dd>{tl(hesap!.kar.toplamMaliyet)} TL</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{hesap!.kar.zarar ? 'Zarar' : 'Kâr'}</dt>
              <dd className={hesap!.kar.zarar ? 'text-destructive' : undefined}>
                {tl(hesap!.kar.zarar ?? hesap!.kar.kar)} TL
              </dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Teklif</dt>
              <dd>{tl(hesap!.kar.teklif)} TL</dd>
            </div>
          </dl>

          {hesap!.dagitim.uyari && (
            <p role="alert" className="text-destructive mb-3 text-sm">
              {hesap!.dagitim.uyari}
            </p>
          )}

          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Dağıtılacak iş kalemi yok.</p>
          ) : (
            <ul className="divide-y border-t">
              {hesap!.dagitim.satirlar.map((satir) => {
                const row = rows.find((r) => r.id === satir.id)!;
                const birim = teklifBirimFiyati(satir.teklifTutari, row.quantity);
                return (
                  <li key={satir.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {row.pozNo || row.description || 'Adsız kalem'}
                    </span>
                    {/* Karar: sabit ve otomatik kalemler açıkça gösterilir. */}
                    <span
                      className={
                        satir.sabit ? 'text-foreground text-xs' : 'text-muted-foreground text-xs'
                      }
                    >
                      {satir.sabit ? 'sabit' : 'otomatik'}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      birim {birim ? birimGoster(birim) : '—'}
                    </span>
                    <span className="w-32 text-right">{tl(satir.teklifTutari)} TL</span>
                    {satir.sabit ? (
                      <Button variant="ghost" size="sm" onClick={() => sabitiKaldir(row)}>
                        Sabiti kaldır
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => sabitle(row, satir.teklifTutari)}
                      >
                        Sabitle
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
