'use client';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { ReleaseNotes } from './release-notes';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: { version: string; releaseNotes: string | null } | null;
  updateReady: boolean;
  onInstall: () => void;
}

/**
 * Güncelleme bildirimi.
 *
 * Ürün kararı (2026-09-07, 2026-09-08'de sıkılaştırıldı): **indirme akışın
 * hiçbir yerinde belli edilmez.** Kullanıcı yalnız "yeni sürüm var" bilgisini
 * ve neyin değiştiğini görür. Bu yüzden burada ilerleme çubuğu, "İndir" düğmesi
 * ya da "indirme tamamlandı" türü bir metin yoktur.
 *
 * Başlık `updateReady` ile DEĞİŞMEZ: başlığın "hazır"a dönmesi indirmenin
 * bittiğini duyururdu.
 *
 * Düğme her iki durumda da **aynı yerde durur**; yalnız metni ve etkinliği
 * değişir. Hazır olmadan düğmenin hiç görünmemesi, sonra birden belirmesi de
 * bir indirme sinyaliydi. "Güncelleme doğrulanıyor" bekleme durumunu anlatır
 * ama neyin beklendiğini söylemez — indirmeden söz etmez.
 *
 * Yeniden başlatma uyarısı yalnız hazır olduğunda görünür, çünkü kullanıcı
 * işini kaydetmeden yeniden başlatılmamalı.
 */
export function UpdateDialog({
  open,
  onOpenChange,
  updateInfo,
  updateReady,
  onInstall,
}: UpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Yeni sürüm var{updateInfo ? `: v${updateInfo.version}` : ''}
          </DialogTitle>
        </DialogHeader>

        {updateInfo?.releaseNotes && <ReleaseNotes ham={updateInfo.releaseNotes} />}

        {updateReady && (
          <p className="text-muted-foreground text-sm">
            Güncellemeyi uygulamak için uygulama yeniden başlatılacak.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Daha Sonra
          </Button>
          <Button onClick={onInstall} disabled={!updateReady} aria-live="polite">
            {updateReady ? (
              'Güncelle ve Yeniden Başlat'
            ) : (
              <>
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Güncelleme doğrulanıyor
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
