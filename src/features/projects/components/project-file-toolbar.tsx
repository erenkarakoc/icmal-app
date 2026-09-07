'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { createProject, encodeProject, MAX_PROJECT_BYTES } from '../lib/icmal-file';
import { useProjectSession } from './project-session';
import { LocalProjectsDialog } from './local-projects-dialog';
import { useProjectLoader } from './use-project-loader';
import { calculateGrandTotal } from '../../cost-estimate/lib/cost-utils';
import { projeGuncelle, projeOlustur } from '../actions';
import type { CostRow } from '../../cost-estimate/types';
import type { PercentageCostRow } from '../../percentage-cost/types';
import { storeCostRows, storeGiderler, storePercentageRows } from '../lib/row-adapters';

type Props = {kind: 'cost'; rows: CostRow[]; onOpen: (rows: CostRow[]) => void} |
  {kind: 'percentage'; rows: PercentageCostRow[]; onOpen: (rows: PercentageCostRow[]) => void};

export function ProjectFileToolbar(props: Props) {
  const session = useProjectSession();
  const {project, setProject, name, setName} = session;
  const desktop = useSyncExternalStore(() => () => {}, () => !!window.electronAPI?.projectSave, () => false);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const activeSession = useRef(session); activeSession.current = session;
  const lock = useRef(false);
  const projeYukle = useProjectLoader();

  async function newLocalProject() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      // Let a numeric input's blur commit before checking for unsaved edits.
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise(resolve => window.setTimeout(resolve, 0));
      if (activeSession.current.dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Yeni proje açıp mevcut çalışmayı değiştirmek istiyor musunuz?')) return;
      const previousFingerprint = activeSession.current.fingerprint;
      const created = createProject('Yeni proje');
      let token: string | undefined;
      if (desktop) {
        const bytes = await encodeProject(created);
        const result = await window.electronAPI!.projectSave({name: created.name, bytes, saveAs: true});
        if (!result) return;
        token = result.token;
      }
      // A dialog or asynchronous write must not discard edits made while waiting.
      if (activeSession.current.fingerprint !== previousFingerprint) {
        setMessage(desktop ? 'Yeni dosya oluşturuldu. Mevcut çalışma değiştiği için açık tutuldu; yeni dosyayı Dosya aç ile açabilirsiniz.' : 'Mevcut çalışma değiştiği için yeni proje açılmadı.');
        return;
      }
      session.setCostRows([]); session.setPercentageRows([]);
      session.setGeneration(n => n + 1); session.setToken(token);
      setProject(created); setName(created.name);
      session.setBaseline(desktop ? JSON.stringify({name: created.name, costRows: [], percentageRows: []}) : '');
      props.onOpen([]);
      setMessage(desktop ? 'Yeni yerel proje oluşturuldu.' : 'Yeni proje açıldı.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Yeni proje oluşturulamadı.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function openFile(file?: File, handover?: {bytes: Uint8Array; token: string}): Promise<boolean> {
    if ((!file && !handover && !desktop) || lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      let bytes: Uint8Array, token: string | undefined;
      if (handover) {
        bytes = handover.bytes; token = handover.token;
      } else if (desktop && !file) {
        const selected = await window.electronAPI!.projectOpen();
        if (!selected) return false;
        bytes = selected.bytes; token = selected.token;
      } else {
        if (!file!.name.toLowerCase().endsWith('.icmal')) throw new Error('Lütfen bir .icmal dosyası seçin.');
        if (file!.size > MAX_PROJECT_BYTES) throw new Error('Proje dosyası boyut sınırını aşıyor.');
        bytes = new Uint8Array(await file!.arrayBuffer());
      }
      const yuklendi = await projeYukle(bytes, {
        token,
        onRows: (cost, percentage) => {
          if (props.kind === 'cost') props.onOpen(cost); else props.onOpen(percentage);
        },
      });
      if (!yuklendi) return false;
      setMessage('Dosya açıldı.');
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Dosya açılamadı.'); return false; }
    finally { lock.current = false; setBusy(false); if (picker.current) picker.current.value = ''; }
  }
  async function exportFile(saveAs = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const base = project ?? createProject(name);
      const snapshot = {...base, name, updatedAt: new Date().toISOString(),
        costRows: storeCostRows(session.costRows), percentageRows: storePercentageRows(session.percentageRows),
        expenses: storeGiderler(session.giderler)};
      const savedFingerprint = session.fingerprint;
      const bytes = await encodeProject(snapshot);
      if (desktop) {
        const result = await window.electronAPI!.projectSave({token: session.token, name, bytes, saveAs});
        if (!result) return;
        session.setToken(result.token); session.setBaseline(savedFingerprint);
        setProject(snapshot); setMessage('Kaydedildi.'); return;
      }
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: 'application/octet-stream'}));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'proje'}.icmal`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setProject(snapshot); setMessage('İndirme başlatıldı.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Dosya kaydedilemedi.'); }
    finally { lock.current = false; setBusy(false); }
  }
  /**
   * Hesaba kaydeder. Acik proje zaten hesaba kayitliysa uzerine yazar
   * (surumleme yok, K-15); degilse yeni proje olusturur ve kota denetimi
   * sunucuda calisir.
   */
  async function hesabaKaydet() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const base = project ?? createProject(name);
      const snapshot = {...base, name, updatedAt: new Date().toISOString(),
        costRows: storeCostRows(session.costRows), percentageRows: storePercentageRows(session.percentageRows),
        expenses: storeGiderler(session.giderler)};
      const savedFingerprint = session.fingerprint;
      const bytes = await encodeProject(snapshot);
      // Listeleme ozeti. Toplam mevcut satir tutarlarindan gelir; K-10'un
      // yuvarlama sozlesmesi (satir 2 ondalik, toplam yuvarlanmis satirlardan)
      // henuz TEMEL-05'te uygulanmadigi icin bu deger o sozlesmeden GECMEZ.
      // TEMEL-05 bitince buradaki hesap da ondan gecmeli.
      const ozet = {
        kalemSayisi: snapshot.costRows.length + snapshot.percentageRows.length,
        toplamTutar: session.costRows.length ? calculateGrandTotal(session.costRows).toFixed(2) : null,
      };
      const sonuc = session.hesapProjeId
        ? await projeGuncelle(session.hesapProjeId, name, bytes, ozet)
        : await projeOlustur(name, bytes, ozet);
      session.setHesapProjeId(sonuc.id);
      session.setBaseline(savedFingerprint);
      setProject(snapshot);
      setMessage(session.hesapProjeId ? 'Hesaba kaydedildi.' : 'Hesaba yeni proje olarak kaydedildi.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Hesaba kaydedilemedi.'); }
    finally { lock.current = false; setBusy(false); }
  }

  const saveAction = useRef(exportFile); saveAction.current = exportFile;
  const openAction = useRef(openFile); openAction.current = openFile;
  // A .icmal file opened from the OS waits in the main process until this mounts.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.filePendingTake) return;
    let cancelled = false;
    const collect = async () => {
      const pending = await api.filePendingTake('icmal').catch(() => null);
      if (pending && !cancelled) await openAction.current(undefined, {bytes: pending.bytes, token: pending.token});
    };
    void collect();
    const stop = api.onFilePending(kind => { if (kind === 'icmal') void collect(); });
    return () => { cancelled = true; stop(); };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); (document.activeElement as HTMLElement | null)?.blur();
        window.setTimeout(() => void saveAction.current(event.shiftKey), 0);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  return <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
    <label className="flex items-center gap-2 text-sm">Proje adı
      <Input className="w-44" value={name} maxLength={200} disabled={busy} onChange={e => setName(e.target.value)} />
    </label>
    <input ref={picker} type="file" accept=".icmal" aria-label="İcmal dosyası" className="hidden" onChange={e => void openFile(e.target.files?.[0])} />
    <Button variant="outline" disabled={busy} onClick={() => void newLocalProject()}>{desktop ? 'Yeni yerel proje' : 'Yeni proje'}</Button>
    <Button variant="outline" disabled={busy} onClick={() => desktop ? void openFile() : picker.current?.click()}>Dosya aç</Button>
    {desktop && <Button variant="outline" disabled={busy} onClick={() => setListOpen(true)}>Yerel projeler</Button>}
    <Button variant="outline" disabled={busy || !name.trim()} onClick={() => void exportFile()}>{desktop ? 'Kaydet' : 'Dışa aktar'}</Button>
    {desktop && <Button variant="outline" disabled={busy || !name.trim()} onClick={() => void exportFile(true)}>Farklı kaydet</Button>}
    <Button variant="outline" disabled={busy || !name.trim()} onClick={() => void hesabaKaydet()}>Hesaba kaydet</Button>
    {session.dirty && <span className="text-muted-foreground text-sm">Kaydedilmemiş değişiklikler</span>}
    {busy && <span role="status" className="text-sm">Dosya işleniyor…</span>}
    {error ? <span role="alert" className="text-destructive text-sm">{error}</span> : <span role="status" className="text-muted-foreground text-sm">{message}</span>}
    {desktop && <LocalProjectsDialog open={listOpen} onOpenChange={setListOpen}
      onOpen={payload => openAction.current(undefined, payload)} />}
  </div>;
}
