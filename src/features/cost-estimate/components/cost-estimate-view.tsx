'use client';

import Decimal from 'decimal.js';
import { kaynakFiyatinaDon, metrajiUygula, satiriGuncelle } from '@shared/lib/satir-guncelle';
import { metrajToplami, type MetrajSatiri } from '@features/projects/lib/metraj';
import { satirTutari } from '@shared/lib/para';
import React, { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { Plus, Search, FileSpreadsheet, Calculator } from 'lucide-react';

import { useProjectSession } from '@features/projects/components/project-session';
import { ProjectFileToolbar } from '@features/projects/components/project-file-toolbar';
import { ExpensesPanel } from '@features/projects/components/expenses-panel';
import { OfferPanel } from '@features/projects/components/offer-panel';
import {
  giderleriHesapla,
  giderToplami,
  toplamMaliyet as toplamMaliyetHesapla,
} from '@features/projects/lib/giderler';
import { karHesapla } from '@features/projects/lib/teklif';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@shared/components/ui/drawer';
import { Button } from '@shared/components/ui/button';
import { Tutar } from '@shared/components/tutar';
import { KalemAyrintiDialog } from '@features/projects/components/kalem-ayrinti-dialog';
import { gruplaraAyir } from '@features/projects/lib/is-gruplari';
import { Input } from '@shared/components/ui/input';
import { CostEstimateTable } from './cost-estimate-table';
import { UploadPozDialog } from './upload-poz-dialog';
import { createEmptyRow, recalculateRowNumbers, calculateGrandTotal } from '../lib/cost-utils';
import type { CostRow, CostSortKey, PozEntry } from '../types';
import type { ImportedRow } from '../lib/excel-import';

export function CostEstimateView() {
  const {
    costRows: rows,
    setCostRows: setRows,
    generation,
    giderler,
    teklifYontemi,
  } = useProjectSession();
  const [fileRevision, setFileRevision] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    key: CostSortKey | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: null, direction: null });
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  // Metraj satir bazlidir; hangi kaleme ait oldugu acik olmali.
  const [metrajRowId, setMetrajRowId] = useState<string | null>(null);
  const [altPanelAcik, setAltPanelAcik] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    rowNumber: 60,
    pozNo: 140,
    description: 400,
    unit: 80,
    quantity: 120,
    unitPrice: 140,
    total: 140,
    percentage: 100,
  });

  // Adjust description column to fill container
  useLayoutEffect(() => {
    if (!tableContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const containerWidth = entries[0].contentRect.width;
      if (containerWidth <= 0) return;
      setColumnWidths((prev) => {
        const otherWidth = Object.entries(prev)
          .filter(([k]) => k !== 'description')
          .reduce((s, [, w]) => s + w, 0);
        const descWidth = Math.max(200, containerWidth - otherWidth - 2);
        if (Math.abs(descWidth - prev.description) < 2) return prev;
        return { ...prev, description: descWidth };
      });
    });
    observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const addRow = useCallback(() => {
    const newRow = createEmptyRow(0);
    setFocusedRowId(newRow.id);
    setRows((prev) => [...prev, { ...newRow, rowNumber: prev.length + 1 }]);
  }, [setRows]);

  const deleteRow = useCallback(
    (id: string) => {
      setRows((prev) => recalculateRowNumbers(prev.filter((r) => r.id !== id)));
    },
    [setRows],
  );

  const updateRow = useCallback(
    (id: string, updates: Partial<CostRow>) => {
      setRows((prev) =>
        // Kural ortak modulde: iki maliyet ekrani ayni sozlesmeyi kullanir.
        prev.map((row) => (row.id === id ? satiriGuncelle(row, updates) : row)),
      );
    },
    [setRows],
  );

  const handlePozSelect = useCallback(
    (id: string, entry: PozEntry) => {
      updateRow(id, {
        pozNo: entry.pozNo,
        description: entry.description,
        unit: entry.unit,
        unitPrice: entry.unitPrice,
        fromDatabase: true,
        source: entry.source,
      });
    },
    [updateRow],
  );

  // K-06 Soru 3-4: kaynak fiyata donus ACIK bir kullanici secimidir; hicbir
  // guncelleme kendiliginden yapmaz.
  const handleRevertPrice = useCallback(
    (id: string) => {
      setRows((prev) => prev.map((row) => (row.id === id ? kaynakFiyatinaDon(row) : row)));
    },
    [setRows],
  );

  const handleMetrajChange = useCallback(
    (id: string, metraj: MetrajSatiri[]) => {
      setRows((prev) =>
        prev.map((row) =>
          row.id === id ? metrajiUygula(row, metraj, metrajToplami(metraj)) : row,
        ),
      );
    },
    [setRows],
  );

  const handleSort = useCallback((key: CostSortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const handleSortExplicit = useCallback((key: CostSortKey, direction: 'asc' | 'desc') => {
    setSortConfig({ key, direction });
  }, []);

  const handleColumnResize = useCallback((key: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [key]: Math.max(40, width) }));
  }, []);

  const handleImportApply = useCallback(
    (importedRows: ImportedRow[]) => {
      setRows((prev) => {
        const newRows: CostRow[] = importedRows.map((r, i) => ({
          id: crypto.randomUUID(),
          rowNumber: prev.length + i + 1,
          pozNo: r.pozNo,
          description: r.description,
          unit: r.unit,
          // Okunamayan hucre burada 0'a iner: satir modeli (CostRow) henuz
          // null tasimiyor, bu TEMEL-04 kapsaminda ayri bir degisiklik. Fark
          // SESSIZ degil -- onizleme her okunamayan hucreyi satir numarasiyla
          // bildirir ve hucre bos gorunur.
          quantity: r.quantity ?? new Decimal(0),
          unitPrice: r.unitPrice ?? new Decimal(0),
          total: satirTutari(r.quantity ?? new Decimal(0), r.unitPrice ?? new Decimal(0)),
          fiyatKaynagi: 'elle' as const,
          fromDatabase: false,
        }));
        return [...prev, ...newRows];
      });
    },
    [setRows],
  );

  const filteredAndSortedRows = useMemo(() => {
    let result = rows;

    // Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.pozNo.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.unit.toLowerCase().includes(q),
      );
    }

    // Sort
    if (sortConfig.key && sortConfig.direction) {
      const { key, direction } = sortConfig;
      const mul = direction === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        if (key === 'rowNumber') return (a.rowNumber - b.rowNumber) * mul;
        if (key === 'quantity' || key === 'unitPrice' || key === 'total' || key === 'percentage') {
          const aVal = key === 'percentage' ? a.total : a[key];
          const bVal = key === 'percentage' ? b.total : b[key];
          return aVal.comparedTo(bVal) * mul;
        }
        return String(a[key]).localeCompare(String(b[key]), 'tr') * mul;
      });
    }

    // Gruplama varsa satirlar bolume gore toplanir; tablo bolum degisince
    // baslik yazar. Bolum sirasi ILK GORULME siradir, kullanicinin kurdugu
    // duzen alfabetik siralamayla bozulmaz.
    if (result.some((r) => r.disiplin?.trim() || r.isGrubu?.trim())) {
      const sira = new Map<string, number>();
      for (const bolum of gruplaraAyir(result)) {
        sira.set(`${bolum.disiplin} ${bolum.isGrubu}`, sira.size);
      }
      const anahtar = (r: CostRow) => `${(r.disiplin ?? '').trim()} ${(r.isGrubu ?? '').trim()}`;
      result = [...result].sort(
        (a, b) => (sira.get(anahtar(a)) ?? 0) - (sira.get(anahtar(b)) ?? 0),
      );
    }

    return result;
  }, [rows, searchQuery, sortConfig]);

  const grandTotal = useMemo(() => calculateGrandTotal(rows), [rows]);
  // Serit yalniz OKUMA icindir; hesaplarin kendisi panellerde durur.
  const giderToplamiTutar = useMemo(() => {
    try {
      return giderToplami(giderleriHesapla(grandTotal, giderler));
    } catch {
      return null;
    }
  }, [grandTotal, giderler]);
  const toplamMaliyet = useMemo(() => {
    try {
      return toplamMaliyetHesapla(grandTotal, giderleriHesapla(grandTotal, giderler));
    } catch {
      // Gider paneli hatayi ve sebebini gosteriyor; burada sessizce yanlis bir
      // toplam uretmektense teklif hesabini devre disi birakiyoruz.
      return null;
    }
  }, [grandTotal, giderler]);

  const teklifTutari = useMemo(() => {
    if (!teklifYontemi || !toplamMaliyet) return null;
    try {
      return karHesapla(toplamMaliyet, teklifYontemi).teklif;
    } catch {
      // Gecersiz oran/tutar girisi seridi dusurmemeli.
      return null;
    }
  }, [teklifYontemi, toplamMaliyet]);

  return (
    <div data-project-editor className="flex h-full flex-col">
      <ProjectFileToolbar
        kind="cost"
        rows={rows}
        onOpen={(loaded) => {
          setRows(loaded);
          setFileRevision((n) => n + 1);
          setSearchQuery('');
          setFocusedRowId(null);
          setSortConfig({ key: null, direction: null });
        }}
      />
      {/* Toolbar */}
      <div className="items-between bg-muted/20 flex flex-col justify-between space-y-2 border-b px-4 py-2 md:flex-row md:items-center md:space-y-0">
        <div className="flex items-center gap-4">
          <div className="relative w-full flex-1 md:max-w-lg">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Ara"
              className="bg-background h-9 pl-9 focus-visible:ring-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => setUploadDialogOpen(true)}
          >
            <FileSpreadsheet className="size-4" />
            <span>Poz Yükle</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={addRow}>
            <Plus className="size-4" />
            <span>Satır Ekle</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <CostEstimateTable
          key={`${generation}-${fileRevision}`}
          rows={filteredAndSortedRows}
          grandTotal={grandTotal}
          sortConfig={sortConfig}
          columnWidths={columnWidths}
          onSort={handleSort}
          onSortExplicit={handleSortExplicit}
          onColumnResize={handleColumnResize}
          onHideColumn={() => {}}
          onFitColumn={() => {}}
          onUpdateRow={updateRow}
          onDeleteRow={deleteRow}
          onPozSelect={handlePozSelect}
          onRevertPrice={handleRevertPrice}
          onOpenMetraj={setMetrajRowId}
          onMoveToGroup={(id, disiplin, isGrubu) => updateRow(id, { disiplin, isGrubu })}
          focusedRowId={focusedRowId}
        />
      </div>

      <div className="shrink-0 overflow-auto px-4">
        <KalemAyrintiDialog
          key={metrajRowId ?? 'kapali'}
          satir={rows.find((r) => r.id === metrajRowId) ?? null}
          tumSatirlar={rows}
          onKapat={() => setMetrajRowId(null)}
          onGrupDegisti={(id, disiplin, isGrubu) => updateRow(id, { disiplin, isGrubu })}
          onMetrajDegisti={handleMetrajChange}
        />

        {/* Gider ve teklif panelleri ekranin altini kapliyordu; asil is olan
            cetvel icin yer birakmak uzere alt panele tasindi. Anahtar sayilar
            seritte GORUNUR kalir; panel yalniz duzenleme icin acilir. */}
        <div className="bg-background/95 sticky bottom-0 mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t py-2 text-sm backdrop-blur">
          <span className="text-muted-foreground">
            İş kalemleri <Tutar deger={grandTotal} className="text-foreground" />
          </span>
          {giderToplamiTutar && !giderToplamiTutar.isZero() && (
            <span className="text-muted-foreground">
              Giderler <Tutar deger={giderToplamiTutar} className="text-foreground" />
            </span>
          )}
          {toplamMaliyet && (
            <span className="font-medium">
              Toplam maliyet <Tutar deger={toplamMaliyet} />
            </span>
          )}
          {teklifTutari && (
            <span className="font-medium">
              Teklif <Tutar deger={teklifTutari} />
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setAltPanelAcik(true)}
          >
            <Calculator className="size-3.5" />
            Gider ve teklif
          </Button>
        </div>

        <Drawer open={altPanelAcik} onOpenChange={setAltPanelAcik}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Gider, kâr ve teklif</DrawerTitle>
              <DrawerDescription>
                Giderler ve kâr yöntemi burada düzenlenir; sonuçlar alttaki şeritte görünür.
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">
              <ExpensesPanel kalemToplami={grandTotal} />
              {toplamMaliyet && <OfferPanel toplamMaliyet={toplamMaliyet} rows={rows} />}
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Status Bar */}
      <div className="bg-muted/40 flex shrink-0 items-center justify-between border-t px-4 py-2 text-sm">
        <span className="text-muted-foreground">{rows.length} satır</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Genel Toplam:</span>
          <Tutar deger={grandTotal} vurgulu className="text-foreground" />
        </div>
      </div>

      <UploadPozDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onApply={handleImportApply}
      />
    </div>
  );
}
