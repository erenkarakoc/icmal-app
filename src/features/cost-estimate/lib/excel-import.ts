import Decimal from 'decimal.js';
import { parseExcelPrice, type ParsedExcel } from '../../editor/lib/excel-parser.ts';

export interface ExcelImportMapping {
  pozNoColumn: number;
  descriptionColumn: number;
  unitColumn: number;
  quantityColumn: number;
  unitPriceColumn: number;
}

export interface ImportedRow {
  pozNo: string;
  description: string;
  unit: string;
  /**
   * Okunamayan ya da bos hucre `null` gelir; SIFIRA CEVRILMEZ (Soru 24).
   * Onceden `?? new Decimal(0)` yaziliyordu ve bozuk bir hucre sessizce 0
   * oluyordu; gercek sifir ile ayirt edilemiyordu.
   */
  quantity: Decimal | null;
  unitPrice: Decimal | null;
  /** Kaynak izi: dosyadaki 1 tabanli satir numarasi. */
  sourceRow: number;
}

/** Onizlemede gosterilecek okunamamis hucre. */
export interface ImportIssue {
  sourceRow: number;
  field: 'quantity' | 'unitPrice';
  raw: string;
}

export interface ImportResult {
  rows: ImportedRow[];
  skippedRows: number[];
  /** Satir aktarildi ama bu hucreler bos birakildi. */
  issues: ImportIssue[];
}

const HEADER_HINTS: Record<keyof ExcelImportMapping, string[]> = {
  pozNoColumn: ['poz', 'poz no', 'iş kalemi no', 'iş kalemi', 'kalem no'],
  descriptionColumn: ['açıklama', 'tanım', 'description', 'iş kalemi açıklama'],
  unitColumn: ['birim', 'ölçü birimi', 'unit'],
  quantityColumn: ['miktar', 'quantity', 'adet'],
  unitPriceColumn: ['birim fiyat', 'fiyat', 'price', 'unit price', 'b.fiyat'],
};

export function guessColumnMapping(headers: string[]): ExcelImportMapping {
  const lower = headers.map((h) => h.toLowerCase().trim());

  function findColumn(hints: string[], fallback: number): number {
    for (const hint of hints) {
      const idx = lower.findIndex((h) => h.includes(hint));
      if (idx !== -1) return idx;
    }
    return fallback;
  }

  return {
    pozNoColumn: findColumn(HEADER_HINTS.pozNoColumn, 0),
    descriptionColumn: findColumn(HEADER_HINTS.descriptionColumn, 1),
    unitColumn: findColumn(HEADER_HINTS.unitColumn, 2),
    quantityColumn: findColumn(HEADER_HINTS.quantityColumn, 3),
    unitPriceColumn: findColumn(HEADER_HINTS.unitPriceColumn, 4),
  };
}

/**
 * Kullanici karari (2026-09-08): okunamayan hucre satiri DUSURMEZ; satir
 * aktarilir, hucre bos kalir ve onizlemede bildirilir. Zorunlu tek alan poz
 * numarasidir. Formullu hucrelerde Excel'in hesaplanmis degeri kullanilir
 * (ayristirici `cell.w`/`cell.v` okuyor).
 */
export function importExcelRows(excel: ParsedExcel, mapping: ExcelImportMapping): ImportResult {
  const rows: ImportedRow[] = [];
  const skippedRows: number[] = [];
  const issues: ImportIssue[] = [];

  // Skip header row (index 0)
  for (let i = 1; i < excel.rows.length; i++) {
    const row = excel.rows[i];
    const sourceRow = row.rowIndex + 1;
    const pozNo = row.cells[mapping.pozNoColumn]?.trim() || '';

    if (!pozNo) {
      skippedRows.push(sourceRow);
      continue;
    }

    const oku = (kolon: number, field: ImportIssue['field']): Decimal | null => {
      const ham = row.cells[kolon] ?? '';
      const deger = parseExcelPrice(ham);
      // Bos hucre bir hata degildir; YAZILI ama okunamayan hucre hatadir.
      if (deger === null && ham.trim() !== '') issues.push({ sourceRow, field, raw: ham.trim() });
      return deger;
    };

    rows.push({
      pozNo,
      description: row.cells[mapping.descriptionColumn]?.trim() || '',
      unit: row.cells[mapping.unitColumn]?.trim() || '',
      quantity: oku(mapping.quantityColumn, 'quantity'),
      unitPrice: oku(mapping.unitPriceColumn, 'unitPrice'),
      sourceRow,
    });
  }

  return { rows, skippedRows, issues };
}
