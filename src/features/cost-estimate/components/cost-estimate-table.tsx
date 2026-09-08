'use client';

import React, { useCallback, useState } from 'react';
import Decimal from 'decimal.js';
import { Trash2, PencilLine, Ruler, GripVertical } from 'lucide-react';
import { TableBody, TableCell, TableHeader, TableRow } from '@shared/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@shared/components/ui/tooltip';
import { Input } from '@shared/components/ui/input';
import { Button } from '@shared/components/ui/button';
import { cozulmusKaynak } from '@shared/lib/satir-guncelle';
import { kalemlerToplami } from '@shared/lib/para';
import { GRUPSUZ_BASLIK } from '@features/projects/lib/is-gruplari';
import { SortableHead } from '@shared/components/sortable-head';
import {
  formatTurkishNumber,
  formatTurkishExact,
  parseTurkishNumber,
} from '@shared/lib/turkish-number';
import { PozSearchCell } from './poz-search-cell';
import type { CostRow, CostSortKey, PozEntry } from '../types';

const COLUMN_LABELS: Record<CostSortKey, string> = {
  rowNumber: '#',
  pozNo: 'Poz No',
  description: 'Tanım',
  unit: 'Birim',
  quantity: 'Miktar',
  unitPrice: 'Birim Fiyat',
  total: 'Toplam',
  percentage: 'Pursantaj',
};

const VISIBLE_COLUMNS: CostSortKey[] = [
  'rowNumber',
  'pozNo',
  'description',
  'unit',
  'quantity',
  'unitPrice',
  'total',
  'percentage',
];

interface CostEstimateTableProps {
  rows: CostRow[];
  grandTotal: Decimal;
  sortConfig: { key: CostSortKey | null; direction: 'asc' | 'desc' | null };
  columnWidths: Record<string, number>;
  onSort: (key: CostSortKey) => void;
  onSortExplicit: (key: CostSortKey, direction: 'asc' | 'desc') => void;
  onColumnResize: (key: string, width: number) => void;
  onHideColumn: (key: string) => void;
  onFitColumn: (key: string) => void;
  onUpdateRow: (id: string, updates: Partial<CostRow>) => void;
  onDeleteRow: (id: string) => void;
  onPozSelect: (id: string, entry: PozEntry) => void;
  onRevertPrice: (id: string) => void;
  onOpenMetraj: (id: string) => void;
  onMoveToGroup: (id: string, disiplin: string, isGrubu: string) => void;
  focusedRowId: string | null;
}

export function CostEstimateTable({
  rows,
  grandTotal,
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
  onRevertPrice,
  onOpenMetraj,
  onMoveToGroup,
  focusedRowId,
}: CostEstimateTableProps) {
  const totalTableWidth = VISIBLE_COLUMNS.reduce((sum, key) => sum + (columnWidths[key] || 0), 0);

  // Gruplama yalniz kullanilmissa gorunur; hicbir satirda grup yoksa tablo
  // eskisi gibi duz kalir.
  // Suruklemek icin YALNIZ # sutunu tutamactir; satirin tamami suruklenirse
  // hucrelerdeki metin secimi bozulur.
  const [suruklenen, setSuruklenen] = useState<string | null>(null);
  const [hedefGrup, setHedefGrup] = useState<string | null>(null);

  const gruplamaVar = rows.some((r) => r.disiplin?.trim() || r.isGrubu?.trim());
  const grupAnahtari = (r: CostRow) => `${(r.disiplin ?? '').trim()} ${(r.isGrubu ?? '').trim()}`;
  const grupBasligi = (r: CostRow) => {
    const parcalar = [(r.disiplin ?? '').trim(), (r.isGrubu ?? '').trim()].filter(Boolean);
    return parcalar.length ? parcalar.join(' › ') : GRUPSUZ_BASLIK;
  };
  const uzerinde = (e: React.DragEvent, satir: CostRow) => {
    if (!suruklenen) return;
    e.preventDefault();
    setHedefGrup(grupAnahtari(satir));
  };

  const birak = (e: React.DragEvent, satir: CostRow) => {
    e.preventDefault();
    setHedefGrup(null);
    if (!suruklenen || suruklenen === satir.id) return;
    onMoveToGroup(suruklenen, (satir.disiplin ?? '').trim(), (satir.isGrubu ?? '').trim());
    setSuruklenen(null);
  };

  const grupToplami = (hepsi: CostRow[], anahtar: string) =>
    kalemlerToplami(hepsi.filter((r) => grupAnahtari(r) === anahtar).map((r) => r.total));

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
                      key === 'percentage'
                    ? 'text-right'
                    : ''
              }
            />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody className="[&_tr:last-child_td]:border-b-0">
        {rows.map((row, index) => (
          <React.Fragment key={row.id}>
            {/* Grup basligi: satirlar gorunumde bolume gore siralanmis gelir,
                bolum degistiginde baslik ve ara toplam yazilir. */}
            {gruplamaVar &&
              (index === 0 || grupAnahtari(rows[index - 1]) !== grupAnahtari(row)) && (
                <TableRow
                  className={
                    hedefGrup === grupAnahtari(row)
                      ? 'bg-primary/15 hover:bg-primary/15'
                      : 'bg-muted/40 hover:bg-muted/40'
                  }
                  onDragOver={(e) => uzerinde(e, row)}
                  onDragLeave={() => setHedefGrup(null)}
                  onDrop={(e) => birak(e, row)}
                >
                  <TableCell
                    colSpan={99}
                    className="border-border border-b py-1.5 text-xs font-medium"
                  >
                    <span className="flex justify-between">
                      <span>{grupBasligi(row)}</span>
                      <span className="font-mono">
                        {formatTurkishNumber(grupToplami(rows, grupAnahtari(row)))}
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
              )}
            <TableRow
              className={`hover:bg-muted/30 odd:bg-muted/5 group ${
                suruklenen === row.id ? 'opacity-50' : ''
              } ${hedefGrup === grupAnahtari(row) ? 'bg-primary/10' : ''}`}
              onDragOver={(e) => uzerinde(e, row)}
              onDragLeave={() => setHedefGrup(null)}
              onDrop={(e) => birak(e, row)}
            >
              {/* # — ayni zamanda surukleme tutamaci */}
              <TableCell
                className="text-muted-foreground border-border cursor-grab overflow-hidden border-r border-b py-1 text-center text-xs font-medium active:cursor-grabbing"
                draggable
                title="Sürükleyerek başka bir gruba taşıyın"
                onDragStart={(e) => {
                  setSuruklenen(row.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setSuruklenen(null);
                  setHedefGrup(null);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <GripVertical
                    aria-hidden
                    className="size-3 opacity-0 transition-opacity group-hover:opacity-60"
                  />
                  {row.rowNumber}
                </span>
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
                <div className="flex items-center gap-1">
                  <Input
                    className="h-8 text-right font-mono text-sm"
                    defaultValue={row.quantity.isZero() ? '' : formatTurkishExact(row.quantity)}
                    key={`qty-${row.id}-${row.metraj?.length ?? 0}-${row.metraj?.length ? row.quantity.toString() : ''}`}
                    // Metraj varsa miktar ONDAN gelir; elle yazilmasi sessizce
                    // metraji gecersiz kilardi.
                    readOnly={!!row.metraj?.length}
                    title={row.metraj?.length ? 'Miktar metrajdan hesaplanıyor' : undefined}
                    onFocus={(e) => {
                      e.target.value = row.quantity.toFixed().replace('.', ',');
                    }}
                    onBlur={(e) => handleQuantityChange(row.id, e.target.value)}
                    onKeyDown={handleNumericKeyDown}
                    placeholder="0,00"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={
                      row.metraj?.length ? 'text-foreground size-7 shrink-0' : 'size-7 shrink-0'
                    }
                    title={
                      row.metraj?.length
                        ? `${row.metraj.length} ölçü satırı — düzenlemek için tıklayın`
                        : 'Mahal bazlı metraj ekle'
                    }
                    aria-label="Metraj"
                    onClick={() => onOpenMetraj(row.id)}
                  >
                    <Ruler className="size-3.5" />
                  </Button>
                </div>
              </TableCell>

              {/* Birim Fiyat */}
              <TableCell className="border-border overflow-hidden border-r border-b p-1">
                <div className="flex items-center gap-1">
                  <Input
                    className="h-8 text-right font-mono text-sm"
                    defaultValue={row.unitPrice.isZero() ? '' : formatTurkishExact(row.unitPrice)}
                    key={`price-${row.id}-${row.fiyatKaynagi ?? ''}-${row.fromDatabase ? row.unitPrice.toString() : ''}`}
                    onFocus={(e) => {
                      e.target.value = row.unitPrice.toFixed().replace('.', ',');
                    }}
                    onBlur={(e) => handleUnitPriceChange(row.id, e.target.value)}
                    onKeyDown={handleNumericKeyDown}
                    placeholder="0,00"
                  />
                  {/* Elle girilmis fiyat: kaynak korunur, tek tikla geri donulur. */}
                  {row.source && cozulmusKaynak(row) === 'elle' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      title={`Elle girilmiş fiyat. Katalog fiyatı: ${formatTurkishNumber(new Decimal(row.source.priceAmount))} — tıklayarak geri dönün.`}
                      aria-label="Katalog fiyatına dön"
                      onClick={() => onRevertPrice(row.id)}
                    >
                      <PencilLine className="size-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>

              {/* Toplam */}
              <TableCell className="border-border overflow-hidden border-r border-b py-1 pr-2 text-right font-mono text-sm font-medium">
                {row.total.isZero() ? '' : formatTurkishNumber(row.total)}
              </TableCell>

              {/* Percentage */}
              <TableCell className="border-border overflow-hidden border-r border-b py-1 pr-2 text-right font-mono text-sm font-medium">
                {(() => {
                  const pct = grandTotal.isZero()
                    ? new Decimal(0)
                    : row.total.div(grandTotal).times(100);
                  return (
                    <div className="flex items-center justify-end gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{formatTurkishNumber(pct, 2)}%</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span className="font-mono">{formatTurkishNumber(pct, 8)}%</span>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <button
                        className="text-muted-foreground hover:text-destructive ml-1 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => onDeleteRow(row.id)}
                        title="Satırı sil"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })()}
              </TableCell>
            </TableRow>
          </React.Fragment>
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
