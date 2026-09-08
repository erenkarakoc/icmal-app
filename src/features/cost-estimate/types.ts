import Decimal from 'decimal.js';
import type { FiyatKaynagi } from '@shared/lib/satir-guncelle';
import type { CatalogSource } from './lib/catalog';

export interface PozEntry {
  pozNo: string;
  description: string;
  unit: string;
  unitPrice: Decimal;
  institution: string;
  source?: CatalogSource;
}

export interface CostRow {
  id: string;
  rowNumber: number;
  pozNo: string;
  description: string;
  unit: string;
  quantity: Decimal;
  unitPrice: Decimal;
  total: Decimal;
  fromDatabase: boolean;
  source?: CatalogSource;
  /**
   * Etkin fiyat kaynağı (K-06 Soru 3-4). `elle` iken `source` silinmez;
   * kaynak fiyata dönüş açık bir seçimdir. `analiz` PROJE-03'te doldurulacak.
   */
  fiyatKaynagi?: FiyatKaynagi;
}

export type CostSortKey =
  | 'rowNumber'
  | 'pozNo'
  | 'description'
  | 'unit'
  | 'quantity'
  | 'unitPrice'
  | 'total'
  | 'percentage';
