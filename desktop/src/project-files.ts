import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, fileDigest, PROJECT_LIMIT, writeProject } from './project-file-store';

export type ProjectPayload = {token: string; name: string; bytes: Uint8Array};

export function registerProjectFiles(window: BrowserWindow, origin: string) {
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
    return {token, name: path.basename(target)};
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
