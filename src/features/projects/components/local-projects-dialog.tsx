'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Button } from '@shared/components/ui/button';

type Reference = {id: string; path: string; name: string; openedAt: string; missing: boolean};
type Opened = {bytes: Uint8Array; token: string};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Loads the chosen file into the shared session; returns false if it refused. */
  onOpen: (payload: Opened) => Promise<boolean>;
};

export function LocalProjectsDialog({open, onOpenChange, onOpen}: Props) {
  const [rows, setRows] = useState<Reference[]>([]);
  const [fault, setFault] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.projectList) return;
    setLoading(true);
    try {
      const result = await api.projectList();
      setRows(result.projects);
      setFault(result.fault);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yerel proje listesi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError('');
      void refresh();
    }
  }, [open, refresh]);

  // Opening and reselecting share one path: both hand bytes to the session and
  // only close the dialog when the session actually accepted them.
  const load = async (action: () => Promise<Opened | null>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await action();
      if (!payload) return;
      if (await onOpen(payload)) onOpenChange(false);
      else await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Proje açılamadı.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const forget = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await window.electronAPI!.projectForgetRef(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Yerel projeler</DialogTitle>
          <DialogDescription>
            Açtığınız ve oluşturduğunuz `.icmal` dosyaları. Listeden kaldırmak dosyayı silmez.
          </DialogDescription>
        </DialogHeader>

        {fault && <p role="status" className="text-muted-foreground text-sm">{fault}</p>}
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

        {loading && rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Liste yükleniyor…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Henüz yerel proje yok. Bir dosya açtığınızda veya kaydettiğinizde burada listelenir.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  <span className="text-muted-foreground block truncate text-xs" title={row.path}>
                    {row.path}
                  </span>
                  {row.missing && (
                    <span className="text-destructive block text-xs">
                      Dosya bulunamadı. Taşındıysa yeniden seçin.
                    </span>
                  )}
                </span>
                {row.missing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void load(() => window.electronAPI!.projectRelocateRef(row.id))}
                  >
                    Yeniden seç
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void load(() => window.electronAPI!.projectOpenRef(row.id))}
                  >
                    Aç
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void forget(row.id)}>
                  Listeden kaldır
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
