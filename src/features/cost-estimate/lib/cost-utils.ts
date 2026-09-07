import Decimal from 'decimal.js';
import { kalemlerToplami } from '../../../shared/lib/para.ts';
import type { CostRow } from '../types';

export function createEmptyRow(rowNumber: number): CostRow {
  return {
    id: crypto.randomUUID(),
    rowNumber,
    pozNo: '',
    description: '',
    unit: '',
    quantity: new Decimal(0),
    unitPrice: new Decimal(0),
    total: new Decimal(0),
    fromDatabase: false,
  };
}

export function recalculateRowNumbers(rows: CostRow[]): CostRow[] {
  return rows.map((row, i) => ({ ...row, rowNumber: i + 1 }));
}

/**
 * Kalemler toplamı. K-10: toplam YUVARLANMIŞ satır tutarlarından üretilir,
 * yuvarlanmamış çarpımların toplamı sonradan yuvarlanarak değil. İki ayrı
 * 0,005 TL'lik kalem 0,01 değil 0,02 TL verir.
 */
export function calculateGrandTotal(rows: CostRow[]): Decimal {
  return kalemlerToplami(rows.map((row) => row.total));
}
