import Decimal from 'decimal.js';
import type { Gider } from './giderler';
import type { CostRow } from '../../cost-estimate/types';
import type { PercentageCostRow } from '../../percentage-cost/types';
import type { IcmalProject } from './icmal-file';

export function storeCostRows(rows: CostRow[]): IcmalProject['costRows'] {
  return rows.map(row => ({id: row.id, pozNo: row.pozNo, description: row.description,
    unit: row.unit, quantity: row.quantity.toFixed(), unitPrice: row.unitPrice.toFixed(),
    ...(row.source ? {source: {...row.source, priceAmount: new Decimal(row.source.priceAmount).toFixed()}} : {})}));
}
export function restoreCostRows(rows: IcmalProject['costRows']): CostRow[] {
  return rows.map((row, index) => {
    if (row.unitPrice === null) throw new Error('Bu tabloda eksik fiyatlı kalemler henüz açılamıyor. Mevcut çalışma korundu.');
    const quantity = new Decimal(row.quantity), unitPrice = new Decimal(row.unitPrice);
    return {...row, source: row.source ? {...row.source} : undefined, quantity, unitPrice,
      rowNumber: index + 1, total: quantity.times(unitPrice), fromDatabase: !!row.source};
  });
}
export function storePercentageRows(rows: PercentageCostRow[]): IcmalProject['percentageRows'] {
  return storeCostRows(rows).map((row, i) => ({...row, percentageLow: rows[i].percentageLow.toFixed(),
    percentageHigh: rows[i].percentageHigh.toFixed(), useRange: rows[i].useRange}));
}
export function restorePercentageRows(rows: IcmalProject['percentageRows']): PercentageCostRow[] {
  return restoreCostRows(rows).map((row, i) => {
    const low = new Decimal(rows[i].percentageLow), high = new Decimal(rows[i].percentageHigh);
    const effective = low.gt(0) && high.gt(0) ? low.plus(high).div(2) : low.gt(0) ? low : high.gt(0) ? high : new Decimal(0);
    return {...row, percentageLow: low, percentageHigh: high, useRange: rows[i].useRange,
      estimatedCost: effective.isZero() ? new Decimal(0) : row.total.div(effective).times(100)};
  });
}

// Gider dönüşümü tek yerde durur: alan eşlemesi (ad↔name, tur↔kind) iki ayrı
// kopyada yazılırsa biri sapınca gider sessizce kaybolur.
export function storeGiderler(giderler: Gider[]): IcmalProject['expenses'] {
  return giderler.map((g) => ({
    id: g.id,
    name: g.ad,
    kind: g.tur,
    value: g.deger,
    // Boş dizi yazmak yerine alanı hiç koymamak dosyayı sade tutar; şema da
    // bunu isteğe bağlı tanımlıyor.
    ...(g.tabanGiderleri?.length ? { baseExpenseIds: g.tabanGiderleri } : {}),
  }));
}

export function restoreGiderler(expenses: IcmalProject['expenses']): Gider[] {
  return expenses.map((e) => ({
    id: e.id,
    ad: e.name,
    tur: e.kind,
    deger: e.value,
    ...(e.baseExpenseIds?.length ? { tabanGiderleri: e.baseExpenseIds } : {}),
  }));
}
