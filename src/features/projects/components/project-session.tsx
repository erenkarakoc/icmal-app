'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import type { CostRow } from '../../cost-estimate/types';
import type { PercentageCostRow } from '../../percentage-cost/types';
import type { IcmalProject } from '../lib/icmal-file';
import type { Gider } from '../lib/giderler';
import type { KarYontemi } from '../lib/teklif';
import { storeCostRows, storePercentageRows } from '../lib/row-adapters';

type Session = {
  costRows: CostRow[]; setCostRows: Dispatch<SetStateAction<CostRow[]>>;
  percentageRows: PercentageCostRow[]; setPercentageRows: Dispatch<SetStateAction<PercentageCostRow[]>>;
  giderler: Gider[]; setGiderler: Dispatch<SetStateAction<Gider[]>>;
  /** Teklif hesabi yapilmamis projede null kalir (K-06 Soru 7). */
  teklifYontemi: KarYontemi | null; setTeklifYontemi: Dispatch<SetStateAction<KarYontemi | null>>;
  /** Kullanicinin sabitledigi kalem teklif tutarlari: satir kimligi -> tutar. */
  sabitTeklifler: Record<string, string>; setSabitTeklifler: Dispatch<SetStateAction<Record<string, string>>>;
  project: IcmalProject | null; setProject: Dispatch<SetStateAction<IcmalProject | null>>;
  name: string; setName: Dispatch<SetStateAction<string>>;
  token: string | undefined; setToken: Dispatch<SetStateAction<string | undefined>>;
  /** Acik proje hesaba kayitliysa kimligi; yerel dosyada undefined kalir. */
  hesapProjeId: string | undefined; setHesapProjeId: Dispatch<SetStateAction<string | undefined>>;
  generation: number; setGeneration: Dispatch<SetStateAction<number>>;
  fingerprint: string; setBaseline: Dispatch<SetStateAction<string>>; dirty: boolean;
};
const Context = createContext<Session | null>(null);
export function ProjectSessionProvider({children}: {children: ReactNode}) {
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [percentageRows, setPercentageRows] = useState<PercentageCostRow[]>([]);
  const [giderler, setGiderler] = useState<Gider[]>([]);
  const [teklifYontemi, setTeklifYontemi] = useState<KarYontemi | null>(null);
  const [sabitTeklifler, setSabitTeklifler] = useState<Record<string, string>>({});
  const [project, setProject] = useState<IcmalProject | null>(null);
  const [name, setName] = useState('Yeni proje');
  const [token, setToken] = useState<string>();
  const [hesapProjeId, setHesapProjeId] = useState<string>();
  const [generation, setGeneration] = useState(0);
  const fingerprint = useMemo(() => JSON.stringify({name, costRows: storeCostRows(costRows),
    percentageRows: storePercentageRows(percentageRows), giderler, teklifYontemi, sabitTeklifler}),
    [name, costRows, percentageRows, giderler, teklifYontemi, sabitTeklifler]);
  const [baseline, setBaseline] = useState(fingerprint);
  const dirty = fingerprint !== baseline;
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      const focused = document.activeElement;
      const pendingInput = (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)
        && !!focused.closest('[data-project-editor]') && focused.value !== focused.defaultValue;
      if (dirty || pendingInput) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  return <Context.Provider value={{costRows,setCostRows,percentageRows,setPercentageRows,giderler,setGiderler,teklifYontemi,setTeklifYontemi,sabitTeklifler,setSabitTeklifler,project,setProject,
    name,setName,token,setToken,hesapProjeId,setHesapProjeId,generation,setGeneration,fingerprint,setBaseline,dirty}}>{children}</Context.Provider>;
}
export function useProjectSession() {
  const value = useContext(Context);
  if (!value) throw new Error('Proje oturumu bulunamadı.');
  return value;
}
