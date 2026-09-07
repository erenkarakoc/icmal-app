import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  getEffectivePercentage,
  calculateEstimatedCost,
  calculateWeightedAverage,
} from '../src/features/percentage-cost/lib/percentage-cost-utils.ts';

const D = (v) => new Decimal(v);

test('tahmini maliyet kurusa iner, devirli ondalik birakmaz', () => {
  // 1000 / 3 x 100 = 33.333,333... -> 33.333,33
  const t = calculateEstimatedCost(D('1000.00'), D(3));
  assert.equal(t.toFixed(2), '33333.33');
  assert.ok(t.decimalPlaces() <= 2, `uzun ondalik kaldi: ${t}`);
});

test('yarim kurus sifirdan uzaga yuvarlanir', () => {
  // 0,15 / 100 x 100 ... dogrudan yarim kurus uretecek bir ornek:
  // 2,005 tutarin %100'u -> 2,005 -> 2,01
  assert.equal(calculateEstimatedCost(D('2.005'), D(100)).toFixed(2), '2.01');
});

test('etkin pursantaj ORAN olarak tam hassasiyette kalir', () => {
  // Oran kurusa indirilseydi bolme sonucu kayardi.
  const p = getEffectivePercentage(D('1.005'), D('2.008'));
  assert.equal(p.toString(), '1.5065');
});

test('tek yonlu pursantajda o deger kullanilir', () => {
  assert.equal(getEffectivePercentage(D('4.5'), D(0)).toString(), '4.5');
  assert.equal(getEffectivePercentage(D(0), D('7.25')).toString(), '7.25');
});

test('pursantaj sifirsa tahmin uydurulmaz', () => {
  assert.equal(getEffectivePercentage(D(0), D(0)).toString(), '0');
  assert.equal(calculateEstimatedCost(D('1000.00'), D(0)).toFixed(2), '0.00');
});

test('agirlikli ortalama kurusa iner', () => {
  const rows = [
    { percentageLow: D(3), percentageHigh: D(0), estimatedCost: D('33333.33') },
    { percentageLow: D(7), percentageHigh: D(0), estimatedCost: D('14285.71') },
  ];
  const o = calculateWeightedAverage(rows);
  assert.ok(o.decimalPlaces() <= 2, `uzun ondalik kaldi: ${o}`);
  // (33333,33x3 + 14285,71x7) / 10 = 199999,96 / 10 = 19999,996 -> 20000,00
  assert.equal(o.toFixed(2), '20000.00');
});

test('pursantajsiz satirlar ortalamaya katilmaz', () => {
  const rows = [
    { percentageLow: D(0), percentageHigh: D(0), estimatedCost: D('999999.00') },
    { percentageLow: D(5), percentageHigh: D(0), estimatedCost: D('100.00') },
  ];
  assert.equal(calculateWeightedAverage(rows).toFixed(2), '100.00');
});

test('hicbir satirda pursantaj yoksa sifir doner, uydurma yapilmaz', () => {
  const rows = [{ percentageLow: D(0), percentageHigh: D(0), estimatedCost: D('500.00') }];
  assert.equal(calculateWeightedAverage(rows).toFixed(2), '0.00');
});

test('negatif tutar korunur', () => {
  assert.equal(calculateEstimatedCost(D('-1000.00'), D(50)).toFixed(2), '-2000.00');
});
