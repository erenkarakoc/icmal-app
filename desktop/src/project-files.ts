import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, fileDigest, PROJECT_LIMIT, writeProject } from './project-file-store';
import type { ProjectRegistry } from './project-registry';

export type ProjectPayload = {token: string; name: string; bytes: Uint8Array};

export function registerProjectFiles(window: BrowserWindow, origin: string, registry: ProjectRegistry) {
  const grants = new Map<string, {path: string; hash: string}>();
  let busy = false;
  const filters = [{name: 'İcmal projesi', extensions: ['icmal']}];
  const register = (channel: string, action: (input: unknown) => Promise<unknown>) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, input) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
          new URL(event.senderFrame.url).origin !== origin) throw new Error('Yetkisiz dosya isteği.');
      if (busy) throw new Error('Başka bir dosya işlemi sürüyor.');
      busy = true;
      try { return await action(input); } finally { busy = false; }
    });
  };
  const readProject = async (target: string): Promise<ProjectPayload> => {
    if (path.extname(target).toLowerCase() !== '.icmal') throw new Error('Bir .icmal dosyası seçin.');
    await fileDigest(target);
    const bytes = await fs.readFile(target);
    if (bytes.length > PROJECT_LIMIT) throw new Error('Dosya boyut sınırını aşıyor.');
    const token = randomUUID(); grants.set(token, {path: target, hash: digest(bytes)});
    await registry.remember(target);
    return {token, name: path.basename(target), bytes: new Uint8Array(bytes)};
  };
  register('project-open', async () => {
    const result = await dialog.showOpenDialog(window, {filters, properties: ['openFile']});
    if (result.canceled) return null;
    return readProject(result.filePaths[0]);
  });
  register('project-save', async input => {
    const data = input as {token?: string; name?: string; bytes?: Uint8Array; saveAs?: boolean};
    if (!data || !(data.bytes instanceof Uint8Array) || !data.bytes.length || data.bytes.length > PROJECT_LIMIT) throw new Error('Geçersiz proje verisi.');
    const grant = data.token ? grants.get(data.token) : undefined;
    if (data.token && !grant) throw new Error('Dosya erişimi kayboldu. Dosyayı yeniden açın.');
    let target: string, expected: string | null;
    if (!grant || data.saveAs) {
      const name = typeof data.name === 'string' ? data.name.slice(0,200).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') : 'proje';
      const result = await dialog.showSaveDialog(window, {filters, defaultPath: `${name}.icmal`});
      if (result.canceled || !result.filePath) return null;
      target = result.filePath;
      if (path.extname(target).toLowerCase() !== '.icmal') throw new Error('Dosya uzantısı .icmal olmalı.');
      expected = await fileDigest(target);
    } else { target = grant.path; expected = grant.hash; }
    const hash = await writeProject(target, data.bytes, expected);
    const token = randomUUID(); grants.set(token, {path: target, hash});
    if (data.token) grants.delete(data.token);
    await registry.remember(target);
    return {token, name: path.basename(target)};
  });
  register('project-list', async () => registry.list());
  register('project-open-ref', async input => {
    const id = (input as {id?: string})?.id;
    const entry = id ? await registry.find(id) : null;
    if (!entry) throw new Error('Proje başvurusu bulunamadı.');
    return readProject(entry.path);
  });
  register('project-forget-ref', async input => {
    const id = (input as {id?: string})?.id;
    // Removing a list entry must never touch the file on disk.
    return {removed: id ? await registry.forget(id) : false};
  });
  register('project-relocate-ref', async input => {
    const id = (input as {id?: string})?.id;
    if (!id || !(await registry.find(id))) throw new Error('Proje başvurusu bulunamadı.');
    const result = await dialog.showOpenDialog(window, {filters, properties: ['openFile']});
    if (result.canceled) return null;
    const target = result.filePaths[0];
    if (path.extname(target).toLowerCase() !== '.icmal') throw new Error('Bir .icmal dosyası seçin.');
    const payload = await readProject(target);
    await registry.relocate(id, target);
    return payload;
  });
  window.on('closed', () => grants.clear());
  // A .icmal file handed over by the shell still needs a save grant, so it is
  // adopted through the same read path as the open dialog.
  return {adopt: readProject};
}

export function registerProjectCloseGuard(window: BrowserWindow) {
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, {type: 'warning',
      buttons: ['Çalışmaya dön', 'Kaydetmeden çık'], defaultId: 0, cancelId: 0,
      message: 'Kaydedilmemiş proje değişiklikleri var.'});
    if (choice === 1) event.preventDefault();
  });
}
