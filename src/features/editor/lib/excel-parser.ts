import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { EkapItem } from '@features/editor/lib/ekap-crypto';

export type MatchField = 'siraNo' | 'pozNo';

export interface ExcelRow {
  rowIndex: number;
  cells: string[];
}

export interface ParsedExcel {
  headers: string[];
  rows: ExcelRow[];
  sheetName: string;
  /** Dosyadaki butun sayfalar; cok sayfali dosyada kullaniciya sunulur. */
  sheetNames: string[];
}

export interface PriceUpdate {
  itemIndex: number;
  siraNo: string;
  isKalemiNo: string;
  aciklama: string;
  currentPrice: Decimal;
  newPrice: Decimal;
  matchedBy: MatchField;
  excelRowIndex: number;
}

export interface MatchResult {
  updates: PriceUpdate[];
  unmatchedExcelRows: number[];
  invalidPriceRows: number[];
  duplicateKeyRows: number[];
}

/**
 * Parse an Excel file and return its contents as a 2D array
 */
export async function parseExcelFile(file: File, sheetIndex = 0): Promise<ParsedExcel> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Cok sayfali dosyada ilk sayfa SESSIZCE kullaniliyordu; kullanici yanlis
  // veriyi aktardigini fark etmiyordu (Soru 24: dosya/sayfa secimi).
  const sheetName = workbook.SheetNames[sheetIndex] ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Get the range of the sheet
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  const rows: ExcelRow[] = [];
  let headers: string[] = [];

  for (let rowIdx = range.s.r; rowIdx <= range.e.r; rowIdx++) {
    const cells: string[] = [];
    for (let colIdx = range.s.c; colIdx <= range.e.c; colIdx++) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
      const cell = sheet[cellAddress];
      // Get raw value, handling formatted numbers
      let value = '';
      if (cell) {
        if (cell.w !== undefined) {
          // Use formatted value if available
          value = cell.w;
        } else if (cell.v !== undefined) {
          value = String(cell.v);
        }
      }
      cells.push(value);
    }

    // Skip completely empty rows
    if (cells.some((c) => c.trim() !== '')) {
      if (rowIdx === range.s.r) {
        headers = cells;
      }
      rows.push({ rowIndex: rowIdx, cells });
    }
  }

  return {
    headers,
    rows,
    sheetName,
    sheetNames: workbook.SheetNames,
  };
}

/**
 * Parse a price value that could be in Turkish (1.234,56) or English (1,234.56) format
 */
export function parseExcelPrice(value: string | number | undefined | null): Decimal | null {
  if (value === undefined || value === null) return null;

  // If it's already a number, convert directly
  if (typeof value === 'number') {
    if (isNaN(value)) return null;
    return new Decimal(value);
  }

  const str = String(value).trim();
  if (str === '') return null;

  // Remove currency symbols and whitespace
  let cleaned = str.replace(/[₺$€£\s]/g, '');

  // Detect format by looking at the pattern
  // Turkish: 1.234,56 (dots for thousands, comma for decimal)
  // English: 1,234.56 (commas for thousands, dot for decimal)

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Turkish format: comma is the decimal separator
    // Remove thousand separators (dots) and replace comma with dot
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // English format: dot is the decimal separator
    // Remove thousand separators (commas)
    cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only commas present - could be decimal or thousand separator
    // If there's exactly one comma and 1-2 digits after, treat as decimal
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      // Multiple commas or more than 2 digits after - thousand separators
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  // If only dots or neither, keep as is (already valid number format)

  try {
    const decimal = new Decimal(cleaned);
    if (decimal.isNaN() || decimal.isNegative()) return null;
    return decimal;
  } catch {
    return null;
  }
}

/**
 * Normalize a sıra no for matching by trimming whitespace
 */
function normalizeKey(value: string): string {
  return value.trim();
}

/**
 * Get column letter from index (0 = A, 1 = B, ..., 26 = AA, etc.)
 */
export function getColumnLetter(index: number): string {
  let letter = '';
  let num = index;
  while (num >= 0) {
    letter = String.fromCharCode((num % 26) + 65) + letter;
    num = Math.floor(num / 26) - 1;
  }
  return letter;
}

/**
 * Match Excel rows to EKAP items by Sıra No and return price updates
 */
export function matchExcelToItems(
  excel: ParsedExcel,
  items: EkapItem[],
  matchField: MatchField,
  keyColumnIndex: number,
  priceColumnIndex: number,
): MatchResult {
  const updates: PriceUpdate[] = [];
  const unmatchedExcelRows: number[] = [];
  const invalidPriceRows: number[] = [];
  const duplicateKeyRows: number[] = [];

  // Create a map for faster item lookup by the selected field
  const itemMap = new Map<string, EkapItem>();
  for (const item of items) {
    const keySource = matchField === 'pozNo' ? item.isKalemiNo : item.siraNo;
    const normalizedKey = normalizeKey(keySource);
    if (!itemMap.has(normalizedKey)) {
      itemMap.set(normalizedKey, item);
    }
  }

  // Track which keys we've already matched to detect duplicates
  const matchedKeys = new Set<string>();

  // Skip header row (first row)
  for (let i = 1; i < excel.rows.length; i++) {
    const row = excel.rows[i];
    const keyValue = row.cells[keyColumnIndex]?.trim() || '';
    const priceValue = row.cells[priceColumnIndex];

    if (!keyValue) continue;

    // Normalize the sıra no for matching
    const normalizedKey = normalizeKey(keyValue);

    // Check for duplicate keys in Excel
    if (matchedKeys.has(normalizedKey)) {
      duplicateKeyRows.push(row.rowIndex + 1); // 1-based for display
      continue;
    }

    // Parse the price
    const newPrice = parseExcelPrice(priceValue);
    if (newPrice === null) {
      invalidPriceRows.push(row.rowIndex + 1);
      continue;
    }

    // Find matching item
    const item = itemMap.get(normalizedKey);
    if (!item) {
      unmatchedExcelRows.push(row.rowIndex + 1);
      continue;
    }

    matchedKeys.add(normalizedKey);

    updates.push({
      itemIndex: item.index,
      siraNo: item.siraNo,
      isKalemiNo: item.isKalemiNo,
      aciklama: item.aciklama,
      currentPrice: item.fiyatDecimal,
      newPrice,
      matchedBy: matchField,
      excelRowIndex: row.rowIndex + 1,
    });
  }

  return {
    updates,
    unmatchedExcelRows,
    invalidPriceRows,
    duplicateKeyRows,
  };
}
