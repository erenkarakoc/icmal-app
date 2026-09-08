'use client';

import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // `key` her keydown olayinda dolu DEGILDIR: tarayici otomatik doldurma,
      // IME bilesimi ve bazi sentetik olaylar tanimsiz birakir. Eskiden burada
      // dogrudan `e.key.toLowerCase()` cagriliyordu ve olay geldigi anda
      // uygulama cokuyordu.
      if (typeof e.key !== 'string') return;
      const basilan = e.key.toLowerCase();

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;
        // Kisayolun kendi tuşu da bos tanimlanmis olabilir; o kayit atlanir.
        const keyMatch = typeof shortcut.key === 'string' && basilan === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          e.preventDefault();
          shortcut.handler(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
