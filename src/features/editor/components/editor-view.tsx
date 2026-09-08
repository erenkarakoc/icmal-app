'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Info,
  Settings2,
  FileSpreadsheet,
  Download,
  Loader2,
  Calculator,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@shared/components/ui/button';
import { Tutar } from '@shared/components/tutar';
import { Input } from '@shared/components/ui/input';
import { Separator } from '@shared/components/ui/separator';
import { TableBody, TableCell, TableHeader, TableRow } from '@shared/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/components/ui/dropdown-menu';
import {
  EkapDocument,
  EkapItem,
  updateItemPrice,
  parseTurkishNumber,
  formatTurkishNumber,
} from '@features/editor/lib/ekap-crypto';
import { SortableHead } from '@shared/components/sortable-head';
import { measureTextWidth } from '@shared/lib/measure-text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@shared/components/ui/tooltip';
import { Kbd } from '@shared/components/ui/kbd';
import { UploadPricesDialog } from '@features/editor/components/upload-prices-dialog';
import { BatchPriceUpdateDialog } from '@features/editor/components/batch-price-update-dialog';
import type { PriceUpdate } from '@features/editor/lib/excel-parser';
import type { SortKey, SortConfig } from '@features/editor/types';
import { exportEkapDocumentToExcel } from '@features/editor/lib/excel-export';
import Decimal from 'decimal.js';

const COLUMN_LABELS: Record<string, string> = {
  siraNo: '#',
  kalemId: 'Kalem ID',
  kod: 'Kod',
  ad: 'Ad',
  isKalemiNo: 'Poz No',
  aciklama: 'Açıklama',
  adetDecimal: 'Miktar',
  birim: 'Birim',
  paraBirimi: 'Para Birimi',
  urunKodu: 'Ürün Kodu',
  urunAd: 'Ürün Adı',
  fiyatDecimal: 'Birim Fiyat',
  toplamDecimal: 'Toplam',
} as const;

const DEFAULT_VISIBLE_COLUMNS = [
  'siraNo',
  'isKalemiNo',
  'aciklama',
  'adetDecimal',
  'birim',
  'fiyatDecimal',
  'toplamDecimal',
];

interface EditorViewProps {
  document: EkapDocument;
  fileName: string;
  onUpdate: (doc: EkapDocument) => void;
  // View State (lifted up for persistence)
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  isActive: boolean;
}

export function EditorView({
  document,
  fileName,
  onUpdate,
  searchQuery,
  onSearchChange,
  sortConfig,
  onSortChange,
  isActive,
}: EditorViewProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [batchUpdateDialogOpen, setBatchUpdateDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Close dialogs when tab becomes inactive to prevent cross-tab bugs
  // (dialogs use Portals and would remain visible even when EditorView is hidden)
  useEffect(() => {
    if (!isActive) {
      setUploadDialogOpen(false);
      setBatchUpdateDialogOpen(false);
      setShowInfo(false);
    }
  }, [isActive]);

  const zeroPriceCount = useMemo(() => {
    return document.items.filter((item) => item.fiyatDecimal.isZero()).length;
  }, [document.items]);

  // Initial column widths
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    siraNo: 60,
    kalemId: 100,
    kod: 100,
    ad: 150,
    isKalemiNo: 120,
    aciklama: 400,
    adetDecimal: 100,
    birim: 80,
    paraBirimi: 100,
    urunKodu: 120,
    urunAd: 150,
    fiyatDecimal: 140,
    toplamDecimal: 140,
  });

  const [containerWidth, setContainerWidth] = useState(0);
  const hasFittedRef = useRef(false);
  const prevLayoutKeyRef = useRef<string>('');

  // Helper function to get column style for text measurement
  const getColumnStyle = useCallback(
    (
      columnKey: string,
    ): { font: string; padding: number; getValue: (item: EkapItem) => string } => {
      switch (columnKey) {
        // Code columns with <code> tag: font-mono text-[10px] + badge padding
        case 'kalemId':
        case 'isKalemiNo':
        case 'urunKodu':
          return {
            font: '10px monospace',
            padding: 32, // cell py-1 + code px-1 + badge bg padding
            getValue: (item) => String(item[columnKey as keyof EkapItem] || ''),
          };

        // Number columns with font-mono text-sm (14px)
        case 'adetDecimal':
        case 'toplamDecimal':
          return {
            font: '14px monospace',
            padding: 24, // cell padding
            getValue: (item) => formatTurkishNumber(item[columnKey]),
          };

        // Price input column: font-mono text-sm + input padding
        case 'fiyatDecimal':
          return {
            font: '14px monospace',
            padding: 40, // cell p-1 (8px) + input px-3 (24px) + extra buffer
            getValue: (item) => formatTurkishNumber(item.fiyatDecimal),
          };

        // Small text columns: text-xs (12px)
        case 'siraNo':
        case 'birim':
        case 'paraBirimi':
          return {
            font: '12px system-ui',
            padding: 16,
            getValue: (item) => String(item[columnKey as keyof EkapItem] || ''),
          };

        // Description column: text-sm (14px)
        case 'aciklama':
          return {
            font: '14px system-ui',
            padding: 16,
            getValue: (item) => item.aciklama,
          };

        // Default text columns
        default:
          return {
            font: '14px system-ui',
            padding: 16,
            getValue: (item) => String(item[columnKey as keyof EkapItem] || ''),
          };
      }
    },
    [],
  );

  // Helper function to calculate optimal width for a single column based on content
  const calculateOptimalColumnWidth = useCallback(
    (key: string): number => {
      let maxContentWidth = 40; // minimum

      // Include header width
      const label = COLUMN_LABELS[key] || '';
      const headerWidth = measureTextWidth(label.toUpperCase(), 'bold 12px system-ui') + 40;
      maxContentWidth = Math.max(maxContentWidth, headerWidth);

      const style = getColumnStyle(key);

      // Check all items for largest content
      for (const item of document.items) {
        const val = style.getValue(item);
        const width = measureTextWidth(val, style.font) + style.padding;
        if (width > maxContentWidth) maxContentWidth = width;
      }

      return maxContentWidth;
    },
    [document.items, getColumnStyle],
  );

  // Helper function to adjust column widths based on container width
  const adjustColumnWidths = useCallback(
    (newContainerWidth: number) => {
      if (!isActive || newContainerWidth <= 0) return;

      const visibleKeys = visibleColumns;
      const layoutKey = `${visibleKeys.join(',')}-${newContainerWidth}`;
      if (prevLayoutKeyRef.current === layoutKey) return;
      prevLayoutKeyRef.current = layoutKey;

      // FIRST LOAD: Auto-fit all columns, aciklama fills remaining
      if (!hasFittedRef.current) {
        const buffer = 2;
        const targetWidth = newContainerWidth - buffer;
        const newWidths: Record<string, number> = {};
        let totalOtherWidth = 0;

        for (const key of visibleKeys) {
          if (key === 'aciklama') continue;
          const optimalWidth = calculateOptimalColumnWidth(key);
          newWidths[key] = optimalWidth;
          totalOtherWidth += optimalWidth;
        }

        // Açıklama fills remaining space (min 100px)
        if (visibleKeys.includes('aciklama')) {
          newWidths.aciklama = Math.max(100, targetWidth - totalOtherWidth);
        }

        setColumnWidths((prev) => ({ ...prev, ...newWidths }));
        hasFittedRef.current = true;
        return;
      }

      // SUBSEQUENT RESIZES: Keep existing proportional logic
      setColumnWidths((prev) => {
        const currentTotal = visibleKeys.reduce((sum, key) => sum + (prev[key] || 0), 0);
        const buffer = 2;
        const targetWidth = newContainerWidth - buffer;

        if (currentTotal > targetWidth) {
          const excess = currentTotal - targetWidth;

          if (visibleKeys.includes('aciklama')) {
            const currentAciklamaWidth = prev.aciklama || 400;
            const minAciklama = 100;
            const canShrinkAciklama = Math.max(0, currentAciklamaWidth - minAciklama);

            if (canShrinkAciklama >= excess) {
              return { ...prev, aciklama: Math.max(minAciklama, prev.aciklama - excess) };
            }
          }

          const newTotalAfterAciklama = visibleKeys.reduce(
            (sum, key) => sum + (key === 'aciklama' ? 100 : prev[key] || 0),
            0,
          );
          const remainingExcess = newTotalAfterAciklama - targetWidth;

          if (remainingExcess > 0) {
            const shrinkableTotal = visibleKeys.reduce((sum, k) => sum + (prev[k] || 0), 0);
            const scale = (shrinkableTotal - remainingExcess) / shrinkableTotal;
            const next = { ...prev };
            visibleKeys.forEach((key) => {
              next[key] = Math.max(40, Math.floor(prev[key] * scale));
            });
            if (visibleKeys.includes('aciklama')) next.aciklama = 100;
            return next;
          }

          if (visibleKeys.includes('aciklama')) return { ...prev, aciklama: 100 };
          return prev;
        } else if (currentTotal < targetWidth && visibleKeys.includes('aciklama')) {
          const diff = targetWidth - currentTotal;
          if (diff > 0) return { ...prev, aciklama: (prev.aciklama || 0) + diff };
        }

        return prev;
      });
    },
    [isActive, visibleColumns, calculateOptimalColumnWidth],
  );

  // Watch for container resize and adjust columns
  useLayoutEffect(() => {
    if (!tableContainerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width > 0) {
        setContainerWidth(width);
        adjustColumnWidths(width);
      }
    });

    observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, [adjustColumnWidths]);

  // Also adjust when visible columns change - this is a valid pattern for responsive layouts
  useEffect(() => {
    if (containerWidth > 0) {
      prevLayoutKeyRef.current = ''; // Reset to force recalculation
      adjustColumnWidths(containerWidth);
    }
  }, [visibleColumns, containerWidth, adjustColumnWidths]);

  const handleColumnResize = (key: string, newWidth: number) => {
    if (containerWidth > 0) {
      const visibleKeys = visibleColumns;
      const otherColumnsWidth = visibleKeys
        .filter((k) => k !== key)
        .reduce((sum, k) => sum + (columnWidths[k] || 0), 0);

      const maxAvailable = Math.max(40, containerWidth - otherColumnsWidth - 2);
      newWidth = Math.min(newWidth, maxAvailable);
    }

    setColumnWidths((prev) => ({
      ...prev,
      [key]: Math.max(40, newWidth),
    }));
  };

  // Focus search on Ctrl+K if active
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (showInfo) setShowInfo(false);
        // We generally handle search clear in parent or let user do it
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, showInfo]);

  const handlePriceChange = useCallback(
    (itemIndex: number, newPriceValue: string) => {
      const priceValue = parseTurkishNumber(newPriceValue);

      // If parsing failed (returned 0 due to error), check if original was 0 or invalid
      if (priceValue.isZero() && newPriceValue !== '0' && newPriceValue !== '0,00') {
        // Re-render to original value or just ignore update
        // For now, we update with the parsed value (0) or we could revert
        // But parseTurkishNumber is now safe.
      }

      if (priceValue.isNegative()) {
        return;
      }

      const updatedDoc = updateItemPrice(document, itemIndex, priceValue);
      onUpdate(updatedDoc);
    },
    [document, onUpdate],
  );

  const handleApplyExcelPrices = useCallback(
    (updates: PriceUpdate[]) => {
      let updatedDoc = document;
      for (const update of updates) {
        updatedDoc = updateItemPrice(updatedDoc, update.itemIndex, update.newPrice);
      }
      onUpdate(updatedDoc);
    },
    [document, onUpdate],
  );

  const handleBatchPriceUpdate = useCallback(
    (percentage: number, isIncrease: boolean) => {
      let updatedDoc = document;
      const multiplier = isIncrease ? 1 + percentage / 100 : 1 - percentage / 100;

      let updatedCount = 0;
      for (const item of document.items) {
        if (!item.fiyatDecimal.isZero()) {
          const newPrice = item.fiyatDecimal.times(multiplier);
          updatedDoc = updateItemPrice(updatedDoc, item.index, newPrice);
          updatedCount++;
        }
      }
      onUpdate(updatedDoc);
      toast.success(
        `${updatedCount} kalemin fiyatı %${percentage} ${isIncrease ? 'artırıldı' : 'azaltıldı'}`,
      );
    },
    [document, onUpdate],
  );

  const handleExportToExcel = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportEkapDocumentToExcel(document, fileName);
      toast.success('Excel dosyası indirildi');
    } catch (error) {
      console.error('Excel export error:', error);
      toast.error('Excel dosyası oluşturulamadı');
    } finally {
      setIsExporting(false);
    }
  }, [document, fileName]);

  const handleSort = useCallback(
    (key: SortKey) => {
      onSortChange({
        key,
        direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
      });
    },
    [sortConfig, onSortChange],
  );

  const handleSortExplicit = useCallback(
    (key: SortKey, direction: 'asc' | 'desc') => {
      onSortChange({ key, direction });
    },
    [onSortChange],
  );

  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key].sort((a, b) => {
            const allKeys = Object.keys(COLUMN_LABELS);
            return allKeys.indexOf(a) - allKeys.indexOf(b);
          }),
    );
  }, []);

  const handleHideColumn = useCallback(
    (key: string) => {
      toggleColumn(key);
    },
    [toggleColumn],
  );

  const handleFitToContent = useCallback(
    (key: string) => {
      const currentContainerWidth = tableContainerRef.current?.clientWidth || 0;
      if (currentContainerWidth <= 0) return;

      // Use shared helper for base optimal width calculation
      let maxContentWidth = calculateOptimalColumnWidth(key);

      // For input columns, also check actual DOM input values (in case user typed but hasn't committed)
      if (key === 'fiyatDecimal' && tableContainerRef.current) {
        const style = getColumnStyle(key);
        const inputs = tableContainerRef.current.querySelectorAll('input');
        inputs.forEach((input) => {
          const inputValue = input.value;
          if (inputValue) {
            const width = measureTextWidth(inputValue, style.font) + style.padding;
            if (width > maxContentWidth) maxContentWidth = width;
          }
        });
      }

      // Calculate what the total width would be with the new column width
      const visibleKeys = visibleColumns;
      const otherColumnsWidth = visibleKeys
        .filter((k) => k !== key)
        .reduce((sum, k) => sum + (columnWidths[k] || 0), 0);

      const buffer = 4;
      const availableWidth = currentContainerWidth - buffer;
      const newTotalWidth = otherColumnsWidth + maxContentWidth;

      if (newTotalWidth <= availableWidth) {
        // Fits within container, just set the new width
        setColumnWidths((prev) => ({ ...prev, [key]: maxContentWidth }));
      } else {
        // Would overflow - need to shrink the widest OTHER column
        const overflow = newTotalWidth - availableWidth;

        // Find the widest visible column (excluding the one being fitted)
        let widestKey = '';
        let widestWidth = 0;
        for (const k of visibleKeys) {
          if (k !== key && (columnWidths[k] || 0) > widestWidth) {
            widestKey = k;
            widestWidth = columnWidths[k] || 0;
          }
        }

        if (widestKey && widestWidth > 40) {
          // Shrink the widest column to make room (but maintain minimum 40px)
          const shrinkAmount = Math.min(overflow, widestWidth - 40);
          const newWidestWidth = widestWidth - shrinkAmount;
          const remainingOverflow = overflow - shrinkAmount;

          // If still overflowing after shrinking widest, cap the target column
          const finalTargetWidth =
            remainingOverflow > 0 ? maxContentWidth - remainingOverflow : maxContentWidth;

          setColumnWidths((prev) => ({
            ...prev,
            [key]: Math.max(40, finalTargetWidth),
            [widestKey]: Math.max(40, newWidestWidth),
          }));
        } else {
          // No room to shrink other columns, just cap at available space
          const maxAvailable = Math.max(40, availableWidth - otherColumnsWidth);
          setColumnWidths((prev) => ({ ...prev, [key]: maxAvailable }));
        }
      }
    },
    [visibleColumns, columnWidths, calculateOptimalColumnWidth, getColumnStyle],
  );

  const handleShrinkToTitle = useCallback(
    (key: string) => {
      const currentContainerWidth = tableContainerRef.current?.clientWidth || 0;
      const label = COLUMN_LABELS[key] || '';
      const titleWidth = Math.max(40, measureTextWidth(label, 'bold 12px sans-serif') + 36); // padding + sort icon

      const currentWidth = columnWidths[key] || 0;
      const shrinkAmount = currentWidth - titleWidth;

      if (shrinkAmount > 0 && currentContainerWidth > 0) {
        // When shrinking, expand the 'aciklama' column if visible to use freed space
        const visibleKeys = visibleColumns;
        if (visibleKeys.includes('aciklama') && key !== 'aciklama') {
          setColumnWidths((prev) => ({
            ...prev,
            [key]: titleWidth,
            aciklama: (prev.aciklama || 0) + shrinkAmount,
          }));
        } else {
          setColumnWidths((prev) => ({ ...prev, [key]: titleWidth }));
        }
      } else {
        setColumnWidths((prev) => ({ ...prev, [key]: titleWidth }));
      }
    },
    [columnWidths, visibleColumns],
  );

  const filteredItems = useMemo(
    () =>
      (document.items || [])
        .filter(
          (item) =>
            item.aciklama.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.isKalemiNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.siraNo.includes(searchQuery),
        )
        .sort((a, b) => {
          const { key, direction } = sortConfig;
          const multiplier = direction === 'asc' ? 1 : -1;

          if (key === 'adetDecimal' || key === 'fiyatDecimal' || key === 'toplamDecimal') {
            return a[key].comparedTo(b[key]) * multiplier;
          }

          if (key === 'index') {
            return (a.index - b.index) * multiplier;
          }

          if (key === 'siraNo') {
            const aNum = parseInt(a.siraNo);
            const bNum = parseInt(b.siraNo);
            if (
              !isNaN(aNum) &&
              !isNaN(bNum) &&
              String(aNum) === a.siraNo &&
              String(bNum) === b.siraNo
            ) {
              return (aNum - bNum) * multiplier;
            }
            return a.siraNo.localeCompare(b.siraNo, 'tr') * multiplier;
          }

          const aVal = String(a[key as keyof EkapItem] || '');
          const bVal = String(b[key as keyof EkapItem] || '');

          return aVal.localeCompare(bVal, 'tr') * multiplier;
        }),
    [document.items, searchQuery, sortConfig],
  );

  const grandTotal = useMemo(
    () =>
      document.items.reduce((sum, item) => sum.plus(item.toplamDecimal), new Decimal(0)) ||
      new Decimal(0),
    [document.items],
  );

  const visibleKeys = visibleColumns;
  const totalTableWidth = useMemo(
    () => visibleKeys.reduce((sum, key) => sum + (columnWidths[key] || 0), 0),
    [visibleKeys, columnWidths],
  );

  // If not active, we can return null OR keep it rendered but hidden for state preservation.
  // Using generic hidden class is often better for keeping scroll position etc. if needed,
  // but switching tabs usually resets scroll unless we handle it heavily.
  // For now, let's use a wrapper div with display style.

  return (
    <div className={`flex h-full flex-col ${!isActive ? 'hidden' : ''}`}>
      {/* Toolbar / Search */}
      <div className="items-between bg-muted/20 flex flex-col justify-between space-y-2 border-b px-4 py-2 md:flex-row md:items-center md:space-y-0">
        <div className="flex items-center gap-4">
          <h1 className="text-foreground text-md">
            {document.tenderInfo.iknYil}/{document.tenderInfo.iknSayi}
          </h1>
          <Separator orientation="vertical" className="h-6" />
          <div className="relative w-full flex-1 md:max-w-lg">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              id="table-search"
              ref={searchInputRef}
              placeholder="Ara"
              className="bg-background h-9 pl-9 focus-visible:ring-1"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
              <Kbd>Ctrl K</Kbd>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-muted-foreground text-sm tabular-nums">
                <span className="text-foreground ml-1 font-medium">{zeroPriceCount}</span>
                <span className="mx-1">/</span>
                {document.items.length}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Birim fiyatı girilmemiş {zeroPriceCount} adet poz bulunuyor.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center justify-between gap-2 md:justify-center">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={handleExportToExcel}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            <span className="hidden sm:inline">Excel&apos;e Aktar</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => setUploadDialogOpen(true)}
          >
            <FileSpreadsheet className="size-4" />
            <span className="hidden sm:inline">Fiyat Yükle</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => setBatchUpdateDialogOpen(true)}
          >
            <Calculator className="size-4" />
            <span className="hidden sm:inline">Toplu Güncelle</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <Settings2 className="size-4" />
                <span className="hidden sm:inline">Sütunlar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              <DropdownMenuLabel>Görünür Sütunlar</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(COLUMN_LABELS).map(([key, label]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={visibleColumns.includes(key)}
                  onCheckedChange={() => toggleColumn(key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table Area */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table
          className="border-border relative w-full max-w-full table-fixed caption-bottom border-separate border-spacing-0 text-sm"
          style={{ width: `${totalTableWidth}px` }}
        >
          <TableHeader className="bg-background sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              {visibleColumns.includes('siraNo') && (
                <SortableHead
                  label={COLUMN_LABELS.siraNo}
                  sortKey="siraNo"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.siraNo}
                  onResize={(w) => handleColumnResize('siraNo', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                  className="text-center"
                />
              )}
              {visibleColumns.includes('kalemId') && (
                <SortableHead
                  label={COLUMN_LABELS.kalemId}
                  sortKey="kalemId"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.kalemId}
                  onResize={(w) => handleColumnResize('kalemId', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('kod') && (
                <SortableHead
                  label={COLUMN_LABELS.kod}
                  sortKey="kod"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.kod}
                  onResize={(w) => handleColumnResize('kod', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('ad') && (
                <SortableHead
                  label={COLUMN_LABELS.ad}
                  sortKey="ad"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.ad}
                  onResize={(w) => handleColumnResize('ad', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('isKalemiNo') && (
                <SortableHead
                  label={COLUMN_LABELS.isKalemiNo}
                  sortKey="isKalemiNo"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.isKalemiNo}
                  onResize={(w) => handleColumnResize('isKalemiNo', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('aciklama') && (
                <SortableHead
                  label={COLUMN_LABELS.aciklama}
                  sortKey="aciklama"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.aciklama}
                  onResize={(w) => handleColumnResize('aciklama', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('adetDecimal') && (
                <SortableHead
                  label={COLUMN_LABELS.adetDecimal}
                  sortKey="adetDecimal"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.adetDecimal}
                  onResize={(w) => handleColumnResize('adetDecimal', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                  className="text-right"
                />
              )}
              {visibleColumns.includes('birim') && (
                <SortableHead
                  label={COLUMN_LABELS.birim}
                  sortKey="birim"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.birim}
                  onResize={(w) => handleColumnResize('birim', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('paraBirimi') && (
                <SortableHead
                  label={COLUMN_LABELS.paraBirimi}
                  sortKey="paraBirimi"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.paraBirimi}
                  onResize={(w) => handleColumnResize('paraBirimi', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('urunKodu') && (
                <SortableHead
                  label={COLUMN_LABELS.urunKodu}
                  sortKey="urunKodu"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.urunKodu}
                  onResize={(w) => handleColumnResize('urunKodu', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('urunAd') && (
                <SortableHead
                  label={COLUMN_LABELS.urunAd}
                  sortKey="urunAd"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.urunAd}
                  onResize={(w) => handleColumnResize('urunAd', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                />
              )}
              {visibleColumns.includes('fiyatDecimal') && (
                <SortableHead
                  label={COLUMN_LABELS.fiyatDecimal}
                  sortKey="fiyatDecimal"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.fiyatDecimal}
                  onResize={(w) => handleColumnResize('fiyatDecimal', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                  className="text-right"
                />
              )}
              {visibleColumns.includes('toplamDecimal') && (
                <SortableHead
                  label={COLUMN_LABELS.toplamDecimal}
                  sortKey="toplamDecimal"
                  activeConfig={sortConfig}
                  onSort={handleSort}
                  onSortExplicit={handleSortExplicit}
                  width={columnWidths.toplamDecimal}
                  onResize={(w) => handleColumnResize('toplamDecimal', w)}
                  onHide={handleHideColumn}
                  onFit={handleFitToContent}
                  onShrink={handleShrinkToTitle}
                  className="text-right"
                />
              )}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr:last-child_td]:border-b-0">
            {filteredItems.map((item, i) => (
              <TableRow key={item.kalemId || i} className="hover:bg-muted/30 odd:bg-muted/5 group">
                {visibleColumns.includes('siraNo') && (
                  <TableCell className="text-muted-foreground border-border overflow-hidden border-r border-b py-1 text-center text-xs font-medium">
                    {item.siraNo}
                  </TableCell>
                )}
                {visibleColumns.includes('kalemId') && (
                  <TableCell className="border-border truncate overflow-hidden border-r border-b py-1 whitespace-nowrap">
                    <code className="bg-muted text-muted-foreground rounded px-1 py-0.5 font-mono text-[10px]">
                      {item.kalemId}
                    </code>
                  </TableCell>
                )}
                {visibleColumns.includes('kod') && (
                  <TableCell className="border-border truncate overflow-hidden border-r border-b py-1 whitespace-nowrap">
                    {item.kod}
                  </TableCell>
                )}
                {visibleColumns.includes('ad') && (
                  <TableCell className="border-border truncate overflow-hidden border-r border-b py-1 whitespace-nowrap">
                    {item.ad}
                  </TableCell>
                )}
                {visibleColumns.includes('isKalemiNo') && (
                  <TableCell className="border-border truncate overflow-hidden border-r border-b py-1 whitespace-nowrap">
                    <span
                      className="bg-muted text-muted-foreground cursor-pointer rounded px-1 py-0.5 font-mono text-[10px] transition-transform active:scale-96"
                      onClick={() => {
                        navigator.clipboard.writeText(item.isKalemiNo);
                        setCopiedId(item.kalemId);
                        setTimeout(() => setCopiedId(null), 1000);
                      }}
                    >
                      {copiedId === item.kalemId ? 'Kopyalandı' : item.isKalemiNo}
                    </span>
                  </TableCell>
                )}
                {visibleColumns.includes('aciklama') && (
                  <TableCell className="border-border max-w-0 truncate overflow-hidden border-r border-b py-1 whitespace-nowrap">
                    <p className="truncate text-sm" title={item.aciklama}>
                      {item.aciklama}
                    </p>
                  </TableCell>
                )}
                {visibleColumns.includes('adetDecimal') && (
                  <TableCell
                    className="decoration-muted-foreground/30 border-border overflow-hidden border-r border-b py-1 text-right font-mono text-sm underline decoration-dotted underline-offset-2"
                    title="Miktar"
                  >
                    {item.adet}
                  </TableCell>
                )}
                {visibleColumns.includes('birim') && (
                  <TableCell className="text-muted-foreground border-border overflow-hidden border-r border-b py-1 text-xs">
                    {item.birim}
                  </TableCell>
                )}
                {visibleColumns.includes('paraBirimi') && (
                  <TableCell className="text-muted-foreground border-border overflow-hidden border-r border-b py-1 text-xs">
                    {item.paraBirimi}
                  </TableCell>
                )}
                {visibleColumns.includes('urunKodu') && (
                  <TableCell className="border-border truncate overflow-hidden border-r border-b py-1 whitespace-nowrap">
                    <code className="bg-muted text-muted-foreground rounded px-1 py-0.5 font-mono text-[10px]">
                      {item.urunKodu}
                    </code>
                  </TableCell>
                )}
                {visibleColumns.includes('urunAd') && (
                  <TableCell className="border-border truncate overflow-hidden border-r border-b py-1 whitespace-nowrap">
                    {item.urunAd}
                  </TableCell>
                )}
                {visibleColumns.includes('fiyatDecimal') && (
                  <TableCell className="border-border overflow-hidden border-r border-b p-1">
                    <div className="flex items-center gap-1">
                      <Input
                        key={`price-${item.index}-${item.fiyat}`}
                        data-price-row={i}
                        className="h-8 border text-right font-mono text-sm"
                        defaultValue={item.fiyat}
                        onFocus={(e) => e.target.select()}
                        onBlur={(e) => handlePriceChange(item.index, e.target.value)}
                        onKeyDown={(e) => {
                          // Arrow down/up: move to next/previous row's price input
                          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            const currentRow = i;
                            const targetRow =
                              e.key === 'ArrowDown' ? currentRow + 1 : currentRow - 1;
                            const targetInput = tableContainerRef.current?.querySelector(
                              `input[data-price-row="${targetRow}"]`,
                            ) as HTMLInputElement | null;
                            if (targetInput) {
                              targetInput.focus();
                              targetInput.select();
                            }
                            return;
                          }

                          // Enter: commit and move to next row
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handlePriceChange(item.index, e.currentTarget.value);
                            const targetInput = tableContainerRef.current?.querySelector(
                              `input[data-price-row="${i + 1}"]`,
                            ) as HTMLInputElement | null;
                            if (targetInput) {
                              targetInput.focus();
                              targetInput.select();
                            }
                            return;
                          }

                          // Allow control keys
                          const isControl =
                            e.ctrlKey ||
                            e.metaKey ||
                            [
                              'Backspace',
                              'Delete',
                              'Tab',
                              'ArrowLeft',
                              'ArrowRight',
                              'Home',
                              'End',
                            ].includes(e.key);

                          if (isControl) return;

                          // Allow digits
                          if (/^[0-9]$/.test(e.key)) return;

                          // Allow decimal separators (dot and comma) - only once
                          if (e.key === '.' || e.key === ',') {
                            const val = e.currentTarget.value;
                            if (val.includes(',') || val.includes('.')) {
                              e.preventDefault();
                            }
                            return;
                          }

                          // Block everything else
                          e.preventDefault();
                        }}
                      />
                    </div>
                  </TableCell>
                )}
                {visibleColumns.includes('toplamDecimal') && (
                  <TableCell className="border-border overflow-hidden border-r border-b py-1 text-right font-mono text-sm font-medium">
                    {item.toplam}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filteredItems.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length}
                  className="text-muted-foreground h-32 text-center"
                >
                  Sonuç bulunamadı
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      {/* Status Bar */}
      <div className="bg-muted/40 flex shrink-0 flex-col items-start justify-between border-t px-4 py-2 text-sm md:flex-row md:items-center">
        <div className="text-muted-foreground flex w-full items-center justify-between gap-4 md:w-auto md:justify-start">
          <Button variant="outline" size="sm" onClick={() => setShowInfo(true)} className="gap-2">
            <Info className="size-4" />
            <span className="hidden sm:inline">İhale Bilgileri</span>
          </Button>
        </div>
        <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-end">
          <span className="text-muted-foreground">Genel Toplam:</span>
          <Tutar deger={grandTotal} vurgulu className="text-foreground" />
        </div>
      </div>

      {/* --- Tender Info Dialog --- */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>İhale Bilgileri</DialogTitle>
          </DialogHeader>

          <div className="mt-4 grid grid-cols-2 gap-x-2 gap-y-4 text-sm">
            <div className="col-span-1 space-y-1">
              <p className="text-muted-foreground text-xs font-semibold uppercase">İKN</p>
              <p className="font-mono">
                {document.tenderInfo.iknYil}/{document.tenderInfo.iknSayi}
              </p>
            </div>
            <div className="col-span-1 space-y-1">
              <p className="text-muted-foreground text-xs font-semibold uppercase">Son Teklif</p>
              <p>{document.tenderInfo.sonTeklif || '-'}</p>
            </div>

            <div className="col-span-2 space-y-1">
              <p className="text-muted-foreground text-xs font-semibold uppercase">İhale Adı</p>
              <p className="leading-relaxed font-medium">{document.tenderInfo.ad}</p>
            </div>

            <div className="col-span-2 mt-2 flex items-center justify-between border-t pt-4">
              <span className="text-muted-foreground font-medium">Hesaplanan Toplam Tutar</span>
              <span className="font-mono text-xl font-bold tracking-tight">
                {formatTurkishNumber(grandTotal)}₺
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- Upload Prices Dialog --- */}
      <UploadPricesDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        document={document}
        onApply={handleApplyExcelPrices}
      />

      {/* --- Batch Price Update Dialog --- */}
      <BatchPriceUpdateDialog
        open={batchUpdateDialogOpen}
        onOpenChange={setBatchUpdateDialogOpen}
        document={document}
        onApply={handleBatchPriceUpdate}
      />
    </div>
  );
}
