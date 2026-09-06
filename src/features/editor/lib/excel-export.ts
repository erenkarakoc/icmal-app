import type { EkapDocument } from '@features/editor/lib/ekap-crypto';

const ITEM_HEADERS = [
  'Sıra No',
  'Kalem ID',
  'Kod',
  'Ad',
  'Poz No',
  'Açıklama',
  'Miktar',
  'Birim',
  'Para Birimi',
  'Ürün Kodu',
  'Ürün Adı',
  'Birim Fiyat',
  'Toplam',
] as const;

function createExcelFileName(fileName: string): string {
  const baseName = fileName.replace(/\.ekap$/i, '') || 'ekap-teklifi';
  const safeBaseName = baseName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
  return `${safeBaseName || 'ekap-teklifi'}.xlsx`;
}

export async function exportEkapDocumentToExcel(
  document: EkapDocument,
  fileName: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const itemRows = document.items.map((item) => [
    item.siraNo,
    item.kalemId,
    item.kod,
    item.ad,
    item.isKalemiNo,
    item.aciklama,
    item.adetDecimal.toNumber(),
    item.birim,
    item.paraBirimi,
    item.urunKodu,
    item.urunAd,
    item.fiyatDecimal.toNumber(),
    item.toplamDecimal.toNumber(),
  ]);

  const offerSheet = XLSX.utils.aoa_to_sheet([[...ITEM_HEADERS], ...itemRows]);
  const lastItemRow = itemRows.length + 1;
  const totalRow = lastItemRow + 1;

  XLSX.utils.sheet_add_aoa(offerSheet, [['Genel Toplam']], { origin: `L${totalRow}` });
  offerSheet[`M${totalRow}`] = {
    t: 'n',
    f: itemRows.length > 0 ? `SUM(M2:M${lastItemRow})` : '0',
    v: document.items.reduce((sum, item) => sum + item.toplamDecimal.toNumber(), 0),
    z: '#,##0.00',
  };

  for (let row = 2; row <= lastItemRow; row += 1) {
    const quantityCell = offerSheet[`G${row}`];
    const priceCell = offerSheet[`L${row}`];
    const totalCell = offerSheet[`M${row}`];
    if (quantityCell) quantityCell.z = '#,##0.########';
    if (priceCell) priceCell.z = '#,##0.00########';
    if (totalCell) totalCell.z = '#,##0.00';
  }

  offerSheet['!autofilter'] = { ref: `A1:M${Math.max(lastItemRow, 1)}` };
  offerSheet['!cols'] = [
    { wch: 10 },
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 },
    { wch: 55 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 18 },
  ];

  const tenderSheet = XLSX.utils.aoa_to_sheet([
    ['Alan', 'Değer'],
    ['İKN', `${document.tenderInfo.iknYil}/${document.tenderInfo.iknSayi}`],
    ['İhale Adı', document.tenderInfo.ad],
    ['Son Teklif', document.tenderInfo.sonTeklif],
    ['Genel Toplam', document.items.reduce((sum, item) => sum + item.toplamDecimal.toNumber(), 0)],
    ['Toplam (Yazıyla)', document.tenderInfo.toplamYazi],
  ]);
  tenderSheet['B5'].z = '#,##0.00';
  tenderSheet['!cols'] = [{ wch: 20 }, { wch: 80 }];

  XLSX.utils.book_append_sheet(workbook, offerSheet, 'Teklif');
  XLSX.utils.book_append_sheet(workbook, tenderSheet, 'İhale Bilgileri');
  workbook.Props = {
    Title: document.tenderInfo.ad || 'EKAP Teklifi',
    Subject: `${document.tenderInfo.iknYil}/${document.tenderInfo.iknSayi}`,
    Author: 'İcmal',
  };

  XLSX.writeFile(workbook, createExcelFileName(fileName), { compression: true });
}
