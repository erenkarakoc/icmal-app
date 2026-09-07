'use client';

import React, { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { Plus, Search, FileSpreadsheet } from 'lucide-react';

import { useProjectSession } from '@features/projects/components/project-session';
import { ProjectFileToolbar } from '@features/projects/components/project-file-toolbar';
import { ExpensesPanel } from '@features/projects/components/expenses-panel';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { formatTurkishNumber } from '@shared/lib/turkish-number';
import { CostEstimateTable } from './cost-estimate-table';
import { UploadPozDialog } from './upload-poz-dialog';
import { createEmptyRow, recalculateRowNumbers, calculateGrandTotal } from '../lib/cost-utils';
import type { CostRow, CostSortKey, PozEntry } from '../types';
import type { ImportedRow } from '../lib/excel-import';

export function CostEstimateView() {
  const { costRows: rows, setCostRows: setRows, generation } = useProjectSession();
  const [fileRevision, setFileRevision] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    key: CostSortKey | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: null, direction: null });
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
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
    setRows(prev => [...prev, {...newRow, rowNumber: prev.length + 1}]);
  }, [setRows]);

  const deleteRow = useCallback((id: string) => {
    setRows((prev) => recalculateRowNumbers(prev.filter((r) => r.id !== id)));
  }, [setRows]);

  const updateRow = useCallback((id: string, updates: Partial<CostRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, ...updates };
        if ('pozNo' in updates && !('source' in updates)) {
          updated.source = undefined;
          updated.fromDatabase = false;
        }
        // Recalculate total when quantity or unitPrice changes
        if ('quantity' in updates || 'unitPrice' in updates) {
          updated.total = updated.quantity.times(updated.unitPrice);
        }
        return updated;
      }),
    );
  }, [setRows]);

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

  const handleImportApply = useCallback((importedRows: ImportedRow[]) => {
    setRows((prev) => {
      const newRows: CostRow[] = importedRows.map((r, i) => ({
        id: crypto.randomUUID(),
        rowNumber: prev.length + i + 1,
        pozNo: r.pozNo,
        description: r.description,
        unit: r.unit,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        total: r.quantity.times(r.unitPrice),
        fromDatabase: false,
      }));
      return [...prev, ...newRows];
    });
  }, [setRows]);

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

    return result;
  }, [rows, searchQuery, sortConfig]);

  const grandTotal = useMemo(() => calculateGrandTotal(rows), [rows]);

  return (
    <div data-project-editor className="flex h-full flex-col">
      <ProjectFileToolbar kind="cost" rows={rows} onOpen={loaded => {
        setRows(loaded); setFileRevision(n => n + 1); setSearchQuery(''); setFocusedRowId(null);
        setSortConfig({key: null, direction: null});
      }} />
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
          focusedRowId={focusedRowId}
        />
      </div>

      <div className="shrink-0 overflow-auto px-4">
        <ExpensesPanel kalemToplami={grandTotal} />
      </div>

      {/* Status Bar */}
      <div className="bg-muted/40 flex shrink-0 items-center justify-between border-t px-4 py-2 text-sm">
        <span className="text-muted-foreground">{rows.length} satır</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Genel Toplam:</span>
          <span className="text-foreground font-mono text-lg font-bold">
            {grandTotal.isZero() ? '0,00' : formatTurkishNumber(grandTotal)}₺
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
