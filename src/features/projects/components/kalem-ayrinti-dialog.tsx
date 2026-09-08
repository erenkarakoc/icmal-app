'use client';

import { useState } from 'react';
import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import type { CostRow } from '@features/cost-estimate/types';
import { kullanilanDisiplinler } from '../lib/is-gruplari';
import type { MetrajSatiri } from '../lib/metraj';
import { MetrajPanel } from './metraj-panel';

/**
 * Kalem ayrıntısı: disiplin, iş grubu ve mahal bazlı metraj.
 *
 * **Neden taslak durumu var.** Alanlar önce `defaultValue` + `onBlur` ile
 * yazılıyordu; kullanıcı yazıp odağı değiştirmeden pencereyi kapattığında
 * yazdığı **kayboluyordu**. Taslak burada tutulur ve hem "Tamam" düğmesinde
 * hem de pencere kapanırken yazılır — nasıl kapatılırsa kapatılsın veri
 * kaybolmaz.
 *
 * Metraj bunun dışındadır: satır ekleme/silme anında uygulanır, çünkü miktar
 * bağı satırın kendisinde hesaplanır.
 */
export function KalemAyrintiDialog({
  satir,
  tumSatirlar,
  onKapat,
  onGrupDegisti,
  onMetrajDegisti,
}: {
  satir: CostRow | null;
  tumSatirlar: CostRow[];
  onKapat: () => void;
  onGrupDegisti: (id: string, disiplin: string, isGrubu: string) => void;
  onMetrajDegisti: (id: string, metraj: MetrajSatiri[]) => void;
}) {
  // Taslak dogrudan kalemden baslar. Cagiran bilesene satir kimligini `key`
  // olarak verir; kalem degisince bilesen yeniden kurulur ve taslak dogru
  // degerle acilir. Efekt icinde state atamak yerine bu desen kullaniliyor.
  const [disiplin, setDisiplin] = useState(satir?.disiplin ?? '');
  const [isGrubu, setIsGrubu] = useState(satir?.isGrubu ?? '');

  const yazVeKapat = () => {
    if (satir) onGrupDegisti(satir.id, disiplin, isGrubu);
    onKapat();
  };

  return (
    <Dialog open={!!satir} onOpenChange={(acik) => !acik && yazVeKapat()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        {satir && (
          <>
            <DialogHeader>
              <DialogTitle>{satir.pozNo || satir.description || 'Adsız kalem'}</DialogTitle>
              <DialogDescription>
                Kalemin grubunu ve mahal bazlı metrajını buradan düzenleyin.
              </DialogDescription>
            </DialogHeader>

            {/* Disiplin hazir listeden, is grubu serbest. Katalog disiplini
                tasimadigi icin otomatik atanmaz. */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="kalem-disiplin">Disiplin</Label>
                <Input
                  id="kalem-disiplin"
                  className="w-40"
                  list="disiplin-listesi"
                  value={disiplin}
                  onChange={(e) => setDisiplin(e.target.value)}
                />
                <datalist id="disiplin-listesi">
                  {kullanilanDisiplinler(tumSatirlar).map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="kalem-is-grubu">İş grubu</Label>
                <Input
                  id="kalem-is-grubu"
                  className="w-48"
                  placeholder="Kaba Yapı"
                  value={isGrubu}
                  onChange={(e) => setIsGrubu(e.target.value)}
                />
              </div>
            </div>

            <MetrajPanel
              satirlar={satir.metraj ?? []}
              birim={satir.unit}
              onChange={(m) => onMetrajDegisti(satir.id, m)}
            />

            <DialogFooter>
              <Button onClick={yazVeKapat}>Tamam</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
