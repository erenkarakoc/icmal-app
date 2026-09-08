'use client';

import { kaynakFiyatinaDon, satiriGuncelle } from '@shared/lib/satir-guncelle';
import { satirTutari } from '@shared/lib/para';
import React, { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { Plus, Search, FileSpreadsheet } from 'lucide-react';
import Decimal from 'decimal.js';

import { useProjectSession } from '@features/projects/components/project-session';
import { ProjectFileToolbar } from '@features/projects/components/project-file-toolbar';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@shared/components/ui/tooltip';
import { formatTurkishNumber } from '@shared/lib/turkish-number';
import { PercentageCostTable } from './percentage-cost-table';
import { UploadPozDialog } from '@features/cost-estimate/components/upload-poz-dialog';
import {
  createEmptyRow,
  recalculateRowNumbers,
  getEffectivePercentage,
  calculateEstimatedCost,
  calculateWeightedAverage,
} from '../lib/percentage-cost-utils';
import type { PercentageCostRow, PercentageCostSortKey, PozEntry } from '../types';
import type { ImportedRow } from '@features/cost-estimate/lib/excel-import';

export function PercentageCostView() {
  const { percentageRows: rows, setPercentageRows: setRows, generation } = useProjectSession();
  const [fileRevision, setFileRevision] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    key: PercentageCostSortKey | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: null, direction: null });
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    rowNumber: 60,
    pozNo: 140,
    description: 300,
    unit: 80,
    quantity: 100,
    unitPrice: 120,
    total: 130,
    percentage: 150,
    estimatedCost: 150,
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
    (id: string, updates: Partial<PercentageCostRow>) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          // Fiyat kaynagi ve tutar kurali ortak modulde; iki maliyet ekrani
          // ayni sozlesmeyi kullanir.
          const updated = satiriGuncelle(row, updates);
          // Recalculate estimatedCost when total, percentageLow, or percentageHigh changes
          if (
            'quantity' in updates ||
            'unitPrice' in updates ||
            'percentageLow' in updates ||
            'percentageHigh' in updates
          ) {
            const effectivePct = getEffectivePercentage(
              updated.percentageLow,
              updated.percentageHigh,
            );
            updated.estimatedCost = calculateEstimatedCost(updated.total, effectivePct);
          }
          return updated;
        }),
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

  const handleToggleRange = useCallback(
    (id: string) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const newUseRange = !row.useRange;
          if (!newUseRange) {
            // Switching back to single: clear percentageHigh and recalculate
            const effectivePct = getEffectivePercentage(row.percentageLow, new Decimal(0));
            const estimatedCost = calculateEstimatedCost(row.total, effectivePct);
            return { ...row, useRange: false, percentageHigh: new Decimal(0), estimatedCost };
          }
          return { ...row, useRange: true };
        }),
      );
    },
    [setRows],
  );

  // K-06 Soru 3-4: kaynak fiyata donus ACIK bir kullanici secimidir; hicbir
  // guncelleme kendiliginden yapmaz.
  const handleRevertPrice = useCallback(
    (id: string) => {
      setRows((prev) => prev.map((row) => (row.id === id ? kaynakFiyatinaDon(row) : row)));
    },
    [setRows],
  );

  const handleSort = useCallback((key: PercentageCostSortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const handleSortExplicit = useCallback(
    (key: PercentageCostSortKey, direction: 'asc' | 'desc') => {
      setSortConfig({ key, direction });
    },
    [],
  );

  const handleColumnResize = useCallback((key: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [key]: Math.max(40, width) }));
  }, []);

  const handleImportApply = useCallback(
    (importedRows: ImportedRow[]) => {
      setRows((prev) => {
        const newRows: PercentageCostRow[] = importedRows.map((r, i) => ({
          id: crypto.randomUUID(),
          rowNumber: prev.length + i + 1,
          pozNo: r.pozNo,
          description: r.description,
          unit: r.unit,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          total: satirTutari(r.quantity, r.unitPrice),
          fiyatKaynagi: 'elle' as const,
          percentageLow: new Decimal(0),
          percentageHigh: new Decimal(0),
          estimatedCost: new Decimal(0),
          useRange: false,
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
        if (key === 'percentage') {
          const aPct = getEffectivePercentage(a.percentageLow, a.percentageHigh);
          const bPct = getEffectivePercentage(b.percentageLow, b.percentageHigh);
          return aPct.comparedTo(bPct) * mul;
        }
        if (
          key === 'quantity' ||
          key === 'unitPrice' ||
          key === 'total' ||
          key === 'estimatedCost'
        ) {
          return a[key].comparedTo(b[key]) * mul;
        }
        return String(a[key]).localeCompare(String(b[key]), 'tr') * mul;
      });
    }

    return result;
  }, [rows, searchQuery, sortConfig]);

  const weightedAverage = useMemo(() => calculateWeightedAverage(rows), [rows]);

  return (
    <div data-project-editor className="flex h-full flex-col">
      <ProjectFileToolbar
        kind="percentage"
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
        <PercentageCostTable
          key={`${generation}-${fileRevision}`}
          rows={filteredAndSortedRows}
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
          onToggleRange={handleToggleRange}
          focusedRowId={focusedRowId}
        />
      </div>

      {/* Status Bar */}
      <div className="bg-muted/40 flex shrink-0 items-center justify-between border-t px-4 py-2 text-sm">
        <span className="text-muted-foreground">{rows.length} satır</span>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground cursor-default underline decoration-dotted">
                  Ağırlıklı Ort. Yaklaşık Maliyet:
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-mono text-xs">
                  Σ(Tahmini Y.M. × Pursantaj) / Σ(Pursantaj)
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-foreground font-mono text-lg font-bold">
            {weightedAverage.isZero() ? '0,00' : formatTurkishNumber(weightedAverage)}₺
          </span>
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
