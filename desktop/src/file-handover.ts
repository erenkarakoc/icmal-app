import { BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handoverKind, type HandoverKind } from './project-launch';
import type { ProjectPayload } from './project-files';
import type { ProjectRegistry } from './project-registry';

type Handover = {kind: HandoverKind; path: string};

// The shell can hand a file over long before the interface that consumes it has
// mounted, so the file waits here and the renderer collects it when ready.
export function registerFileHandover(
  window: BrowserWindow,
  origin: string,
  adopt: (target: string) => Promise<ProjectPayload>,
  registry: ProjectRegistry,
) {
  let pending: Handover | null = null;
  const guard = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
        new URL(event.senderFrame.url).origin !== origin) throw new Error('Yetkisiz dosya isteği.');
  };
  // Peek lets the shell route to the right screen without consuming the file.
  ipcMain.removeHandler('file-pending-kind');
  ipcMain.handle('file-pending-kind', async event => {
    guard(event);
    return pending?.kind ?? null;
  });
  ipcMain.removeHandler('file-pending-take');
  ipcMain.handle('file-pending-take', async (event, kind: unknown) => {
    guard(event);
    if (!pending || pending.kind !== kind) return null;
    const target = pending.path;
    pending = null;
    if (kind === 'icmal') return adopt(target);
    // .ekap files are the authority's own output and can be far larger than a
    // project file, so the .icmal size limit deliberately does not apply here.
    const bytes = await fs.readFile(target);
    return {name: path.basename(target), bytes: new Uint8Array(bytes)};
  });
  // A listed project opened from a screen that cannot load it itself is queued
  // the same way the shell queues a double-clicked file: the consuming screen
  // collects it after the renderer navigates there.
  ipcMain.removeHandler('project-queue-ref');
  ipcMain.handle('project-queue-ref', async (event, input: unknown) => {
    guard(event);
    const id = (input as {id?: string})?.id;
    const entry = id ? await registry.find(id) : null;
    if (!entry) throw new Error('Proje başvurusu bulunamadı.');
    pending = {kind: 'icmal', path: entry.path};
    return {queued: true};
  });
  return {
    handOver(target: string) {
      const kind = handoverKind(target);
      if (!kind) return;
      pending = {kind, path: target};
      if (!window.isDestroyed()) window.webContents.send('file-pending', kind);
    },
  };
}
