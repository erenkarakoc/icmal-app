'use client';

import React, { useCallback } from 'react';
import { Trash2, ChevronsLeftRight } from 'lucide-react';
import { TableBody, TableCell, TableHeader, TableRow } from '@shared/components/ui/table';
import { Input } from '@shared/components/ui/input';
import { SortableHead } from '@shared/components/sortable-head';
import {
  formatTurkishNumber,
  formatTurkishExact,
  parseTurkishNumber,
} from '@shared/lib/turkish-number';
import { PozSearchCell } from '@features/cost-estimate/components/poz-search-cell';
import type { PercentageCostRow, PercentageCostSortKey, PozEntry } from '../types';

const COLUMN_LABELS: Record<PercentageCostSortKey, string> = {
  rowNumber: '#',
  pozNo: 'Poz No',
  description: 'Tanım',
  unit: 'Birim',
  quantity: 'Miktar',
  unitPrice: 'B. Fiyat',
  total: 'Tutar',
  percentage: 'Pursantaj (%)',
  estimatedCost: 'Tahmini Y.M.',
};

const VISIBLE_COLUMNS: PercentageCostSortKey[] = [
  'rowNumber',
  'pozNo',
  'description',
  'unit',
  'quantity',
  'unitPrice',
  'total',
  'percentage',
  'estimatedCost',
];

interface PercentageCostTableProps {
  rows: PercentageCostRow[];
  sortConfig: { key: PercentageCostSortKey | null; direction: 'asc' | 'desc' | null };
  columnWidths: Record<string, number>;
  onSort: (key: PercentageCostSortKey) => void;
  onSortExplicit: (key: PercentageCostSortKey, direction: 'asc' | 'desc') => void;
  onColumnResize: (key: string, width: number) => void;
  onHideColumn: (key: string) => void;
  onFitColumn: (key: string) => void;
  onUpdateRow: (id: string, updates: Partial<PercentageCostRow>) => void;
  onDeleteRow: (id: string) => void;
  onPozSelect: (id: string, entry: PozEntry) => void;
  onToggleRange: (id: string) => void;
  focusedRowId: string | null;
}

export function PercentageCostTable({
  rows,
  sortConfig,
  columnWidths,
  onSort,
  onSortExplicit,
  onColumnResize,
  onHideColumn,
  onFitColumn,
  onUpdateRow,
  onDeleteRow,
  onPozSelect,
  onToggleRange,
  focusedRowId,
}: PercentageCostTableProps) {
  const totalTableWidth = VISIBLE_COLUMNS.reduce((sum, key) => sum + (columnWidths[key] || 0), 0);

  const handleQuantityChange = useCallback(
    (id: string, value: string) => {
      const quantity = parseTurkishNumber(value);
      if (quantity.isNegative()) return;
      onUpdateRow(id, { quantity });
    },
    [onUpdateRow],
  );

  const handleUnitPriceChange = useCallback(
    (id: string, value: string) => {
      const unitPrice = parseTurkishNumber(value);
      if (unitPrice.isNegative()) return;
      onUpdateRow(id, { unitPrice });
    },
    [onUpdateRow],
  );

  const handlePercentageLowChange = useCallback(
    (id: string, value: string) => {
      const percentageLow = parseTurkishNumber(value);
      if (percentageLow.isNegative()) return;
      onUpdateRow(id, { percentageLow });
    },
    [onUpdateRow],
  );

  const handlePercentageHighChange = useCallback(
    (id: string, value: string) => {
      const percentageHigh = parseTurkishNumber(value);
      if (percentageHigh.isNegative()) return;
      onUpdateRow(id, { percentageHigh });
    },
    [onUpdateRow],
  );

  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        'ArrowDown',
        'ArrowUp',
      ].includes(e.key);
    if (isControl) return;
    if (/^[0-9]$/.test(e.key)) return;
    if (e.key === '.' || e.key === ',') {
      const val = e.currentTarget.value;
      if (val.includes(',') || val.includes('.')) {
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.currentTarget.blur();
      return;
    }
    e.preventDefault();
  };

  return (
    <table
      className="border-border relative w-full max-w-full table-fixed caption-bottom border-separate border-spacing-0 text-sm"
      style={{ width: `${totalTableWidth}px` }}
    >
      <TableHeader className="bg-background sticky top-0 z-10">
        <TableRow className="hover:bg-transparent">
          {VISIBLE_COLUMNS.map((key) => (
            <SortableHead
              key={key}
              label={COLUMN_LABELS[key]}
              sortKey={key}
              activeConfig={sortConfig}
              onSort={onSort}
              onSortExplicit={onSortExplicit}
              width={columnWidths[key] || 100}
              onResize={(w) => onColumnResize(key, w)}
              onHide={onHideColumn}
              onFit={onFitColumn}
              className={
                key === 'rowNumber'
                  ? 'text-center'
                  : key === 'quantity' ||
                      key === 'unitPrice' ||
                      key === 'total' ||
                      key === 'percentage' ||
                      key === 'estimatedCost'
                    ? 'text-right'
                    : ''
              }
            />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody className="[&_tr:last-child_td]:border-b-0">
        {rows.map((row) => (
          <TableRow key={row.id} className="hover:bg-muted/30 odd:bg-muted/5 group">
            {/* # */}
            <TableCell className="text-muted-foreground border-border overflow-hidden border-r border-b py-1 text-center text-xs font-medium">
              {row.rowNumber}
            </TableCell>

            {/* Poz No */}
            <TableCell className="border-border overflow-hidden border-r border-b p-1">
              <PozSearchCell
                value={row.pozNo}
                onChange={(val) => onUpdateRow(row.id, { pozNo: val })}
                onSelect={(entry) => onPozSelect(row.id, entry)}
                autoFocus={row.id === focusedRowId}
              />
            </TableCell>

            {/* Tanım */}
            <TableCell className="border-border max-w-0 overflow-hidden border-r border-b p-1">
              <PozSearchCell
                field="tanim"
                value={row.description}
                onChange={(value) => onUpdateRow(row.id, { description: value })}
                onSelect={(entry) => onPozSelect(row.id, entry)}
              />
            </TableCell>

            {/* Birim */}
            <TableCell className="border-border overflow-hidden border-r border-b p-1">
              <Input
                className="h-8 text-xs"
                value={row.unit}
                onChange={(e) => onUpdateRow(row.id, { unit: e.target.value })}
                placeholder="Birim"
              />
            </TableCell>

            {/* Miktar */}
            <TableCell className="border-border overflow-hidden border-r border-b p-1">
              <Input
                className="h-8 text-right font-mono text-sm"
                defaultValue={row.quantity.isZero() ? '' : formatTurkishExact(row.quantity)}
                key={`qty-${row.id}`}
                onFocus={(e) => {
                  e.target.value = row.quantity.toFixed().replace('.', ',');
                }}
                onBlur={(e) => handleQuantityChange(row.id, e.target.value)}
                onKeyDown={handleNumericKeyDown}
                placeholder="0,00"
              />
            </TableCell>

            {/* B. Fiyat */}
            <TableCell className="border-border overflow-hidden border-r border-b p-1">
              <Input
                className="h-8 text-right font-mono text-sm"
                defaultValue={row.unitPrice.isZero() ? '' : formatTurkishExact(row.unitPrice)}
                key={`price-${row.id}-${row.fromDatabase ? row.unitPrice.toString() : ''}`}
                onFocus={(e) => {
                  e.target.value = row.unitPrice.toFixed().replace('.', ',');
                }}
                onBlur={(e) => handleUnitPriceChange(row.id, e.target.value)}
                onKeyDown={handleNumericKeyDown}
                placeholder="0,00"
              />
            </TableCell>

            {/* Tutar */}
            <TableCell className="border-border overflow-hidden border-r border-b py-1 pr-2 text-right font-mono text-sm font-medium">
              {row.total.isZero() ? '' : formatTurkishNumber(row.total)}
            </TableCell>

            {/* Pursantaj (%) */}
            <TableCell className="border-border overflow-hidden border-r border-b p-1">
              <div className="flex items-center gap-1">
                {row.useRange ? (
                  <>
                    <Input
                      className="h-8 min-w-0 flex-1 text-right font-mono text-sm"
                      defaultValue={
                        row.percentageLow.isZero() ? '' : formatTurkishNumber(row.percentageLow)
                      }
                      key={`pctLow-${row.id}-range`}
                      onFocus={(e) => {
                        e.target.value = row.percentageLow.toFixed().replace('.', ',');
                      }}
                      onBlur={(e) => handlePercentageLowChange(row.id, e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      placeholder="Alt"
                    />
                    <Input
                      className="h-8 min-w-0 flex-1 text-right font-mono text-sm"
                      defaultValue={
                        row.percentageHigh.isZero() ? '' : formatTurkishNumber(row.percentageHigh)
                      }
                      key={`pctHigh-${row.id}-range`}
                      onFocus={(e) => {
                        e.target.value = row.percentageHigh.toFixed().replace('.', ',');
                      }}
                      onBlur={(e) => handlePercentageHighChange(row.id, e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      placeholder="Üst"
                    />
                  </>
                ) : (
                  <Input
                    className="h-8 min-w-0 flex-1 text-right font-mono text-sm"
                    defaultValue={
                      row.percentageLow.isZero() ? '' : formatTurkishNumber(row.percentageLow)
                    }
                    key={`pctLow-${row.id}-single`}
                    onFocus={(e) => {
                      e.target.value = row.percentageLow.toFixed().replace('.', ',');
                    }}
                    onBlur={(e) => handlePercentageLowChange(row.id, e.target.value)}
                    onKeyDown={handleNumericKeyDown}
                    placeholder="0,00"
                  />
                )}
                <button
                  type="button"
                  className={`shrink-0 rounded p-0.5 transition-colors ${row.useRange ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  onClick={() => onToggleRange(row.id)}
                  title={row.useRange ? 'Tek değere dön' : 'Aralık moduna geç'}
                >
                  <ChevronsLeftRight className="size-3.5" />
                </button>
              </div>
            </TableCell>

            {/* Tahmini Y.M. */}
            <TableCell className="border-border overflow-hidden border-r border-b py-1 pr-2 text-right font-mono text-sm font-medium">
              <div className="flex items-center justify-end gap-1">
                <span>
                  {row.estimatedCost.isZero() ? '' : formatTurkishNumber(row.estimatedCost)}
                </span>
                <button
                  className="text-muted-foreground hover:text-destructive ml-1 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onDeleteRow(row.id)}
                  title="Satırı sil"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={VISIBLE_COLUMNS.length}
              className="text-muted-foreground h-32 text-center"
            >
              Henüz satır eklenmedi. &quot;Satır Ekle&quot; ile başlayın.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </table>
  );
}
