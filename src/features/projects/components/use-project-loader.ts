'use client';

import { useCallback, useEffect, useRef } from 'react';
import { decodeProject } from '../lib/icmal-file';
import { restoreCostRows, restorePercentageRows, storeCostRows, storePercentageRows } from '../lib/row-adapters';
import { useProjectSession } from './project-session';
import type { CostRow } from '../../cost-estimate/types';
import type { PercentageCostRow } from '../../percentage-cost/types';

type Secenek = {
  /** Masaustu yerel dosya belirteci; hesap projesinde verilmez. */
  token?: string;
  /** Hesaba kayitli projenin kimligi; yerel dosyada verilmez. */
  hesapProjeId?: string;
  /** Acilan satirlari ekrana yansitmak isteyen sayfa icin. */
  onRows?: (cost: CostRow[], percentage: PercentageCostRow[]) => void;
};

/**
 * `.icmal` baytlarini ortak oturuma yukler.
 *
 * Cozme, dogrulama ve kaydedilmemis is onayi TEK yerde durur; yerel dosya,
 * kabuktan devralma ve hesap projesi ayni yoldan gecer. Ikinci bir kopya
 * yazmak, onaylardan birinin zamanla digerinden sapmasi demekti.
 *
 * Oturum degerleri ref uzerinden okunur: cagri sirasinda gecen sure icinde
 * kullanicinin yaptigi degisiklik gozden kacmasin.
 */
export function useProjectLoader() {
  const session = useProjectSession();
  const aktif = useRef(session);
  // Render sirasinda ref yazmak React kurallarina aykiri; effect'te guncellenir.
  // Yukleyici cagrildiginda render tamamlanmis olur, yani deger tazedir.
  useEffect(() => {
    aktif.current = session;
  });

  return useCallback(async (bytes: Uint8Array, secenek: Secenek = {}): Promise<boolean> => {
    const loaded = await decodeProject(bytes);
    const costRows = restoreCostRows(loaded.costRows);
    const percentageRows = restorePercentageRows(loaded.percentageRows);

    // Onay cozmeden SONRA sorulur: gecersiz bir dosya icin kullaniciyi
    // bosuna uyarmayalim.
    if (aktif.current.dirty &&
        !window.confirm('Kaydedilmemiş değişiklikler var. Projeyi açıp mevcut çalışmayı değiştirmek istiyor musunuz?')) {
      return false;
    }

    const o = aktif.current;
    o.setCostRows(costRows);
    o.setPercentageRows(percentageRows);
    o.setGeneration((n) => n + 1);
    o.setToken(secenek.token);
    o.setHesapProjeId(secenek.hesapProjeId);
    o.setProject(loaded);
    o.setName(loaded.name);
    o.setBaseline(JSON.stringify({
      name: loaded.name,
      costRows: storeCostRows(costRows),
      percentageRows: storePercentageRows(percentageRows),
    }));
    secenek.onRows?.(costRows, percentageRows);
    return true;
  }, []);
}
