'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import { Button } from '@shared/components/ui/button';

type Reference = { id: string; path: string; name: string; openedAt: string; missing: boolean };

const SHOWN = 5;

/**
 * Recent local `.icmal` files on the home screen (K-04 / Soru 16). Desktop only:
 * the browser has no local file access. Opening queues the file in the main
 * process and navigates; the target screen collects it through the same
 * handover path a double-clicked file uses, so the loading rules — decode,
 * validation and the unsaved-work confirmation — live in one place.
 */
export function LocalProjectsSection() {
  const router = useRouter();
  const desktop = useSyncExternalStore(
    () => () => {},
    () => !!window.electronAPI?.projectList,
    () => false,
  );
  const [rows, setRows] = useState<Reference[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.projectList) return;
    try {
      const result = await api.projectList();
      setRows(result.projects);
      if (result.fault) setError(result.fault);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yerel proje listesi alınamadı.');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (desktop) void refresh();
  }, [desktop, refresh]);

  const open = async (row: Reference) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await window.electronAPI!.projectQueueRef(row.id);
      router.push('/yerel');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Proje açılamadı.');
      setBusy(false);
      void refresh();
    }
  };

  const forget = async (row: Reference) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await window.electronAPI!.projectForgetRef(row.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };

  // Nothing to say before the list has loaded, and nothing at all in a browser.
  if (!desktop || !ready || (rows.length === 0 && !error)) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-sm font-medium">Yerel projeler</h2>
      <p className="text-muted-foreground mb-3 text-xs">
        Bilgisayarınızdaki `.icmal` dosyaları. Listeden kaldırmak dosyayı silmez.
      </p>

      {error && (
        <p role="alert" className="text-destructive mb-2 text-xs">
          {error}
        </p>
      )}

      <ul className="divide-y rounded-md border">
        {rows.slice(0, SHOWN).map((row) => (
          <li key={row.id} className="flex items-center gap-3 p-3">
            <div className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
              <FolderOpen className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.name}</span>
              <span className="text-muted-foreground block truncate text-xs" title={row.path}>
                {row.missing ? 'Dosya bulunamadı. Taşındıysa yeniden seçin.' : row.path}
              </span>
            </div>
            {!row.missing && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void open(row)}>
                Aç
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void forget(row)}>
              Kaldır
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
