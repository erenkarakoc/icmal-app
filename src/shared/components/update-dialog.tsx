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
 * Ürün kararı (2026-09-07): indirme kullanıcıya bildirilmez. Kullanıcı yalnız
 * "yeni sürüm var" bilgisini ve neyin değiştiğini görür; indirme arka planda
 * biter ve ancak o zaman yeniden başlatma önerilir. Bu yüzden burada ilerleme
 * çubuğu ya da "İndir" düğmesi yoktur.
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
            {updateReady ? 'Güncelleme hazır' : 'Yeni sürüm var'}
            {updateInfo ? `: v${updateInfo.version}` : ''}
          </DialogTitle>
        </DialogHeader>

        {updateInfo?.releaseNotes && <ReleaseNotes ham={updateInfo.releaseNotes} />}

        <p className="text-muted-foreground text-sm">
          {updateReady
            ? 'Güncellemeyi uygulamak için uygulama yeniden başlatılacak.'
            : 'Güncelleme arka planda hazırlanıyor. Hazır olduğunda size bildirilecek.'}
        </p>

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
