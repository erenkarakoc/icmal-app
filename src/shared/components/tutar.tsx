import type Decimal from 'decimal.js';
import { formatTurkishNumber } from '@shared/lib/turkish-number';
import { cn } from '@shared/lib/utils';

/**
 * Para tutarı gösterimi.
 *
 * Tek yerde durur çünkü aynı tutar üç ekranda üç farklı biçimde yazılıyordu:
 * durum çubuklarında `21.286.307,00₺` (sembol sayıyla aynı boyda, kalın ve
 * monospace — mono `₺` glifi geniş olduğu için orantısız duruyordu), yeni
 * özet şeridinde ise `… TL`.
 *
 * Sembol sayıdan **ayrılır**: kendi boyutunda, soluk ve boşluklu. Sayı
 * `tabular-nums` ile yazılır ki alt alta gelen tutarlar hizalansın.
 *
 * Yuvarlama burada YAPILMAZ. Gösterilecek değer çağıranın sorumluluğudur;
 * tutar `para.ts` sözleşmesinden geçmiş olarak gelir.
 */
export function Tutar({
  deger,
  className,
  vurgulu = false,
}: {
  deger: Decimal;
  className?: string;
  /** Durum çubuğu gibi öne çıkan yerlerde büyük ve kalın yazılır. */
  vurgulu?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <span className={cn('font-mono tabular-nums', vurgulu && 'text-lg font-bold')}>
        {formatTurkishNumber(deger)}
      </span>
      <span className="text-muted-foreground text-xs" aria-hidden>
        ₺
      </span>
      <span className="sr-only">Türk lirası</span>
    </span>
  );
}
