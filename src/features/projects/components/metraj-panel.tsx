'use client';

import Decimal from 'decimal.js';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { formatTurkishExact, parseTurkishNumber } from '@shared/lib/turkish-number';
import {
  araToplam,
  eklenenToplam,
  mahallereGore,
  metrajToplami,
  minhaToplam,
  type MetrajSatiri,
} from '../lib/metraj';

/**
 * Mahal bazlı metraj paneli (PROJE-02 · K-06 Soru 25).
 *
 * Ölçü alanları boş bırakılabilir ve boş alan çarpıma girmez; bu yüzden dördü
 * de aynı biçimde sunulur ve hiçbirine varsayılan değer yazılmaz. Minha ayrı
 * bir liste değil, satırdaki bir işarettir — düşülen ölçü kendi satırında
 * pozitif okunur.
 *
 * Panel miktarı kendisi yazmaz; değişikliği yukarı bildirir, miktar bağı
 * `satir-guncelle.ts` içindeki `metrajiUygula` sözleşmesindedir.
 */

const OLCU_ALANLARI = [
  ['adet', 'Adet'],
  ['boy', 'Boy'],
  ['en', 'En'],
  ['yukseklik', 'Yükseklik'],
] as const;

type OlcuAlani = (typeof OLCU_ALANLARI)[number][0];

export function MetrajPanel({
  satirlar,
  birim,
  onChange,
}: {
  satirlar: MetrajSatiri[];
  birim: string;
  onChange: (satirlar: MetrajSatiri[]) => void;
}) {
  const sayi = (d: Decimal) => formatTurkishExact(d);

  const guncelle = (id: string, degisiklik: Partial<MetrajSatiri>) =>
    onChange(satirlar.map((s) => (s.id === id ? { ...s, ...degisiklik } : s)));

  const ekle = () =>
    onChange([
      ...satirlar,
      {
        id: crypto.randomUUID(),
        mahal: '',
        adet: null,
        boy: null,
        en: null,
        yukseklik: null,
        minha: false,
      },
    ]);

  const sil = (id: string) => onChange(satirlar.filter((s) => s.id !== id));

  // Bos hucre 0 DEGILDIR: alan bosaltilinca null yazilir ve carpima girmez.
  const olcuYaz = (id: string, alan: OlcuAlani, metin: string) =>
    guncelle(id, { [alan]: metin.trim() === '' ? null : parseTurkishNumber(metin) });

  const toplam = metrajToplami(satirlar);
  const mahaller = mahallereGore(satirlar).filter((m) => m.mahal !== '');

  return (
    <section className="mt-6 rounded-md border p-4" data-project-editor>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Metraj</h2>
        <Button variant="outline" size="sm" onClick={ekle}>
          <Plus className="size-3.5" />
          Ölçü satırı ekle
        </Button>
      </div>

      {satirlar.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ölçü satırı yok. Satır eklerseniz kalemin miktarı bu ölçülerden hesaplanır; elle
          yazdığınız miktar saklanır ve satırları kaldırınca geri gelir.
        </p>
      ) : (
        <>
          <ul className="divide-y border-t">
            {satirlar.map((satir) => (
              <li key={satir.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Input
                  className="h-8 w-40"
                  aria-label="Mahal"
                  placeholder="Mahal"
                  defaultValue={satir.mahal}
                  onBlur={(e) => guncelle(satir.id, { mahal: e.target.value })}
                />
                {OLCU_ALANLARI.map(([alan, etiket]) => (
                  <Input
                    key={alan}
                    className="h-8 w-20 text-right font-mono"
                    aria-label={etiket}
                    placeholder={etiket}
                    inputMode="decimal"
                    defaultValue={satir[alan] === null ? '' : formatTurkishExact(satir[alan])}
                    onBlur={(e) => olcuYaz(satir.id, alan, e.target.value)}
                  />
                ))}
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={satir.minha}
                    onChange={(e) => guncelle(satir.id, { minha: e.target.checked })}
                  />
                  Minha
                </label>
                <span
                  className={`w-28 text-right font-mono ${satir.minha ? 'text-destructive' : ''}`}
                >
                  {satir.minha ? '−' : ''}
                  {sayi(araToplam(satir))}
                </span>
                <Button variant="ghost" size="sm" onClick={() => sil(satir.id)}>
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">Ölçü satırını sil</span>
                </Button>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Eklenen</dt>
              <dd className="font-mono">{sayi(eklenenToplam(satirlar))}</dd>
            </div>
            {!minhaToplam(satirlar).isZero() && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Düşülen (minha)</dt>
                <dd className="text-destructive font-mono">−{sayi(minhaToplam(satirlar))}</dd>
              </div>
            )}
            <div className="flex justify-between font-medium">
              <dt>Miktar</dt>
              <dd className="font-mono">
                {sayi(toplam)} {birim}
              </dd>
            </div>
          </dl>

          {/* Dusulenler eklenenleri asarsa sonuc negatiftir; sessizce
              sifirlanmaz, kullaniciya soylenir. */}
          {toplam.isNegative() && (
            <p role="alert" className="text-destructive mt-2 text-sm">
              Düşülen ölçüler eklenenleri aşıyor; miktar negatif çıkıyor. Ölçüleri gözden geçirin.
            </p>
          )}

          {mahaller.length > 1 && (
            <div className="text-muted-foreground mt-3 text-xs">
              {mahaller.map((m) => (
                <span key={m.mahal} className="mr-3">
                  {m.mahal}: <span className="font-mono">{sayi(m.toplam)}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
