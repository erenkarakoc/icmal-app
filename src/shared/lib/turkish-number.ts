import Decimal from 'decimal.js';

// Parse Turkish number format (1.234,56) to Decimal
export function parseTurkishNumber(value: string): Decimal {
  if (!value || typeof value !== 'string' || value.trim() === '') return new Decimal(0);
  try {
    // Remove thousand separators (dots) and replace comma with period
    const normalized = value.replace(/\./g, '').replace(',', '.');
    return new Decimal(normalized);
  } catch (e) {
    console.error(`Failed to parse Turkish number: ${value}`, e);
    return new Decimal(0);
  }
}

function binlikAyir(intPart: string): string {
  // Eksi işareti gruplamaya karışmasın.
  const negatif = intPart.startsWith('-');
  const rakamlar = negatif ? intPart.slice(1) : intPart;
  const gruplu = rakamlar.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return negatif ? `-${gruplu}` : gruplu;
}

// Format Decimal to Turkish number format
export function formatTurkishNumber(value: Decimal, decimals: number = 2): string {
  const fixed = value.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  return `${binlikAyir(intPart)},${decPart}`;
}

/**
 * Değeri HİÇBİR basamak kaybetmeden Türkçe biçimde yazar.
 *
 * K-10: düzenleme alanında tam değer görünür ve gösterim kısaltması hesap
 * girdisi yapılmaz. Düzenlenebilir hücreler `formatTurkishNumber` ile 2
 * ondalığa kısaltılıp `onBlur`'da o metin geri ayrıştırıldığında, hücreye
 * girip çıkmak bile kaynak hassasiyetini yok ediyordu (12,3456 → 12,35).
 * Bu yüzden düzenleme alanları bu işlevi kullanmalı.
 */
export function formatTurkishExact(value: Decimal): string {
  const [intPart, decPart] = value.toFixed().split('.');
  const tamsayi = binlikAyir(intPart);
  return decPart ? `${tamsayi},${decPart}` : tamsayi;
}
