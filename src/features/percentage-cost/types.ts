import Decimal from 'decimal.js';
import type { FiyatKaynagi } from '@shared/lib/satir-guncelle';
import type { CatalogSource } from '@features/cost-estimate/lib/catalog';

export type { PozEntry } from '@features/cost-estimate/types';

export type PercentageCostSortKey =
  | 'rowNumber'
  | 'pozNo'
  | 'description'
  | 'unit'
  | 'quantity'
  | 'unitPrice'
  | 'total'
  | 'percentage'
  | 'estimatedCost';

export interface PercentageCostRow {
  id: string;
  rowNumber: number;
  pozNo: string;
  description: string;
  unit: string;
  quantity: Decimal;
  unitPrice: Decimal;
  total: Decimal;
  percentageLow: Decimal;
  percentageHigh: Decimal;
  estimatedCost: Decimal;
  useRange: boolean;
  fromDatabase: boolean;
  source?: CatalogSource;
  /**
   * Etkin fiyat kaynağı (K-06 Soru 3-4). `elle` iken `source` silinmez;
   * kaynak fiyata dönüş açık bir seçimdir. `analiz` PROJE-03'te doldurulacak.
   */
  fiyatKaynagi?: FiyatKaynagi;
}
