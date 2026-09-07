'use client';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
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
 * bittiğini duyururdu. Hazır olduğunda yalnız kurulum düğmesi belirir; yeniden
 * başlatma uyarısı da o zaman görünür, çünkü kullanıcı işini kaydetmeden
 * yeniden başlatılmamalı.
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
          {updateReady && <Button onClick={onInstall}>Güncelle ve Yeniden Başlat</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
