'use client';

import { releaseNotlariniAyristir } from '@shared/lib/release-notes';

/** Sürüm notlarını kategorili ve stillenebilir biçimde gösterir. */
export function ReleaseNotes({ ham }: { ham: string }) {
  const bloklar = releaseNotlariniAyristir(ham);
  if (bloklar.length === 0) return null;

  return (
    <div className="bg-muted/40 max-h-56 space-y-3 overflow-y-auto rounded border p-3">
      {bloklar.map((blok, i) => (
        <div key={i}>
          {blok.baslik && (
            <h3 className="mb-1 text-xs font-medium tracking-wide uppercase">{blok.baslik}</h3>
          )}
          <ul className="space-y-1">
            {blok.maddeler.map((madde, j) => (
              <li key={j} className="text-muted-foreground flex gap-2 text-sm">
                <span aria-hidden className="text-muted-foreground/60">•</span>
                <span>{madde}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
