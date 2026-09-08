'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@shared/components/ui/input';
import { searchCatalog, type CatalogSearchField } from '../lib/catalog-search';
import { fiyatEtiketi, type CatalogEntry } from '../lib/catalog';
import type { PozEntry } from '../types';

interface PozSearchCellProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (entry: PozEntry) => void;
  autoFocus?: boolean;
  field?: CatalogSearchField;
}

export function PozSearchCell({
  value,
  onChange,
  onSelect,
  autoFocus,
  field = 'poz_numarasi',
}: PozSearchCellProps) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [state, setState] = useState<{
    query: string;
    results: CatalogEntry[];
    error: string | null;
    loading: boolean;
  }>({ query: '', results: [], error: null, loading: false });
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 400, maxHeight: 260 });
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = state.query === query;
  const results = current ? state.results : [];
  const loading = query.trim().length >= 2 && (!current || state.loading);
  const error = current ? state.error : null;

  useEffect(() => {
    setQuery(value);
  }, [value]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState({ query, results: [], error: null, loading: true });
      setActiveIndex(-1);
      try {
        const found = await searchCatalog(query, controller.signal, field);
        if (!controller.signal.aborted)
          setState({ query, results: found, error: null, loading: false });
      } catch (cause) {
        if (!controller.signal.aborted)
          setState({
            query,
            results: [],
            error: cause instanceof Error ? cause.message : 'Katalog yüklenemedi.',
            loading: false,
          });
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen, retry, field]);

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    const outside = (event: MouseEvent) => {
      if (
        !inputRef.current?.contains(event.target as Node) &&
        !dropdownRef.current?.contains(event.target as Node)
      )
        close();
    };
    const scroll = (event: Event) => {
      if (!dropdownRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [isOpen]);
  useEffect(() => {
    if (activeIndex >= 0)
      document.getElementById(`${id}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, id]);

  function open() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(440, window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 12;
    const maxHeight = Math.min(260, Math.max(below >= 160 ? below : rect.top - 12, 80));
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: below >= 160 ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4),
      width,
      maxHeight,
    });
    setIsOpen(true);
  }
  function select(entry: CatalogEntry) {
    // K-09 / TEMEL-04: fiyatin birimi pozun biriminden farkliysa donusum
    // YAPILMAZ. Sessizce eklemek yanlis miktar girilmesine yol acar; kullanici
    // bilerek devam edebilsin diye acikca soruluyor.
    if (
      entry.pozBirimi &&
      !window.confirm(
        `Bu fiyat ${entry.unit} birimine ait, poz ${entry.pozBirimi} birimiyle ölçülüyor. ` +
          `Birim dönüşümü yapılmayacak; miktarı ${entry.unit} cinsinden girmelisiniz. Eklensin mi?`,
      )
    )
      return;
    setQuery(field === 'tanim' ? entry.description : entry.pozNo);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(entry);
  }

  return (
    <div>
      <Input
        ref={inputRef}
        className={`h-8 text-sm ${field === 'poz_numarasi' ? 'font-mono' : ''}`}
        value={query}
        placeholder={field === 'tanim' ? 'Tanım' : 'Poz No'}
        role="combobox"
        aria-label={field === 'tanim' ? 'Tanım ara' : 'Poz numarası ara'}
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && results[activeIndex] ? `${id}-${activeIndex}` : undefined}
        onFocus={open}
        onBlur={(event) => {
          if (!dropdownRef.current?.contains(event.relatedTarget)) setIsOpen(false);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
          onChange(event.target.value);
          open();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
            setActiveIndex(-1);
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) open();
            if (results.length)
              setActiveIndex((index) =>
                event.key === 'ArrowDown'
                  ? (index + 1) % results.length
                  : index <= 0
                    ? results.length - 1
                    : index - 1,
              );
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (isOpen && results[activeIndex]) select(results[activeIndex]);
            else setIsOpen(false);
          }
        }}
      />
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={position}
            className="bg-popover text-popover-foreground fixed z-[100] overflow-auto rounded-md border shadow-lg"
          >
            <div role="status" className="text-muted-foreground border-b px-3 py-2 text-xs">
              {query.trim().length < 2
                ? 'En az 2 karakter yazın.'
                : loading
                  ? 'Katalog aranıyor…'
                  : error ||
                    (results.length
                      ? 'TRY fiyatları · Dönem ve birimi seçin. Sonuçları daraltmak için aramayı uzatın.'
                      : 'Seçilebilir TRY fiyatı bulunamadı.')}
            </div>
            {error && (
              <button
                type="button"
                className="px-3 py-2 text-sm underline"
                onClick={() => setRetry((n) => n + 1)}
              >
                Tekrar dene
              </button>
            )}
            <div id={id} role="listbox" aria-label="Katalog sonuçları">
              {results.map((entry, index) => (
                <div
                  key={entry.key}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`cursor-pointer px-3 py-2 text-sm ${index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    select(entry);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <div className="font-mono font-medium">{entry.pozNo}</div>
                  <div className="break-words">{entry.description}</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {entry.institution} · {entry.source.book} · {entry.source.period}
                  </div>
                  <div className="mt-1 text-xs">
                    {fiyatEtiketi(entry.source.priceType)} · {entry.unit} ·{' '}
                    {entry.unitPrice.toFixed(2)} TRY
                  </div>
                  {entry.pozBirimi && (
                    <div className="text-destructive mt-0.5 text-xs">
                      Fiyat {entry.unit}, poz {entry.pozBirimi} birimiyle ölçülüyor — dönüşüm
                      yapılmaz.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
