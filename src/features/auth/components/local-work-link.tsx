'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';

/**
 * Offline escape hatch on the login screen. Without a session the proxy sends
 * every protected route to /login, so on the desktop this is the only way back
 * to local `.icmal` work when there is no network or no account.
 * Rendered only in the desktop shell; the browser has no local file access.
 */
export function LocalWorkLink() {
  const desktop = useSyncExternalStore(
    () => () => {},
    () => !!window.electronAPI?.projectSave,
    () => false,
  );
  if (!desktop) return null;

  return (
    <p className="text-muted-foreground text-center text-sm">
      Bağlantı yoksa{' '}
      <Link href="/yerel" className="text-foreground underline underline-offset-4">
        yerel projelerinizle çalışmaya
      </Link>{' '}
      devam edebilirsiniz.
    </p>
  );
}
