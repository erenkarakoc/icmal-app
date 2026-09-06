'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Routes whose screen collects a handed-over file. The first entry is where a
// handover is sent when the user is somewhere else.
const CONSUMERS = {
  icmal: ['/yaklasik-maliyet', '/maliyet-sihirbazi'],
  ekap: ['/editor'],
} as const;

// The main process holds a file handed over by the shell until the screen that
// consumes it mounts. Bring the user to that screen; the screen itself collects.
export function FileHandoverRouter() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.filePendingKind) return;
    let cancelled = false;
    const route = async () => {
      const kind = await api.filePendingKind().catch(() => null);
      if (!kind || cancelled) return;
      const routes = CONSUMERS[kind];
      if (!routes.some((route) => pathname === route)) router.push(routes[0]);
    };
    void route();
    const stop = api.onFilePending(() => void route());
    return () => {
      cancelled = true;
      stop();
    };
  }, [router, pathname]);

  return null;
}
