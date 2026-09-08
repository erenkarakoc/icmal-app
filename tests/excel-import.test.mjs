import test from 'node:test';
import assert from 'node:assert/strict';
import { importExcelRows, guessColumnMapping } from '../src/features/cost-estimate/lib/excel-import.ts';

const esleme = { pozNoColumn: 0, descriptionColumn: 1, unitColumn: 2, quantityColumn: 3, unitPriceColumn: 4 };
const dosya = (satirlar) => ({
  headers: ['Poz No', 'Açıklama', 'Birim', 'Miktar', 'Birim Fiyat'],
  sheetName: 'Sayfa1',
  sheetNames: ['Sayfa1'],
  rows: satirlar.map((cells, i) => ({ rowIndex: i, cells })),
});

test('okunamayan sayi SIFIRA cevrilmez, bos kalir', () => {
  // Soru 24: "sayi hatasi sifir yapilmaz, eksik fiyat gercek sifirdan ayrilir."
  // Onceden `?? new Decimal(0)` yaziliyordu ve bozuk hucre sessizce 0 oluyordu.
  const { rows } = importExcelRows(
    dosya([['Poz No', 'Açıklama', 'Birim', 'Miktar', 'Birim Fiyat'],
           ['15.100', 'Kazı', 'm³', 'abc', '12,50']]),
    esleme,
  );
  assert.equal(rows[0].quantity, null, 'bozuk miktar null olmali');
  assert.equal(rows[0].unitPrice.toFixed(2), '12.50');
});

test('gercek sifir korunur, bosluk sayilmaz', () => {
  const { rows } = importExcelRows(
    dosya([['h'], ['15.100', 'Kazı', 'm³', '0', '0']]),
    esleme,
  );
  assert.equal(rows[0].quantity.toString(), '0');
  assert.equal(rows[0].unitPrice.toString(), '0');
});

test('okunamayan hucre onizlemede bildirilir', () => {
  const { issues } = importExcelRows(
    dosya([['h'], ['15.100', 'Kazı', 'm³', 'abc', 'xyz']]),
    esleme,
  );
  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map((i) => i.field).sort(), ['quantity', 'unitPrice']);
  assert.equal(issues[0].sourceRow, 2, 'kaynak satir numarasi 1 tabanli');
  assert.equal(issues[0].raw, 'abc', 'ham deger kullaniciya gosterilebilmeli');
});

test('bos hucre hata sayilmaz', () => {
  // Yazili ama okunamayan hucre hatadir; hic yazilmamis hucre degil.
  const { rows, issues } = importExcelRows(
    dosya([['h'], ['15.100', 'Kazı', 'm³', '', '']]),
    esleme,
  );
  assert.equal(issues.length, 0);
  assert.equal(rows[0].quantity, null);
});

test('poz numarasi yoksa satir atlanir ve numarasi bildirilir', () => {
  const { rows, skippedRows } = importExcelRows(
    dosya([['h'], ['', 'Kazı', 'm³', '5', '10'], ['15.100', 'Dolgu', 'm³', '2', '3']]),
    esleme,
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(skippedRows, [2]);
});

test('kaynak satir izi korunur', () => {
  const { rows } = importExcelRows(
    dosya([['h'], ['15.100', 'a', 'm', '1', '2'], ['15.200', 'b', 'm', '1', '2']]),
    esleme,
  );
  assert.deepEqual(rows.map((r) => r.sourceRow), [2, 3]);
});

test('yalniz poz no zorunlu; digerleri bos olsa da satir gelir', () => {
  const { rows } = importExcelRows(dosya([['h'], ['15.100', '', '', '', '']]), esleme);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pozNo, '15.100');
});

test('sutun tahmini Turkce basliklari bulur', () => {
  const m = guessColumnMapping(['Sıra', 'Poz No', 'Tanım', 'Birim', 'Miktar', 'B.Fiyat']);
  assert.equal(m.pozNoColumn, 1);
  assert.equal(m.descriptionColumn, 2);
  assert.equal(m.unitColumn, 3);
  assert.equal(m.quantityColumn, 4);
  assert.equal(m.unitPriceColumn, 5);
});
