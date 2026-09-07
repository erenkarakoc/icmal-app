import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  projectOpen: () => ipcRenderer.invoke('project-open'),
  projectSave: (input: {token?: string; name: string; bytes: Uint8Array; saveAs: boolean}) => ipcRenderer.invoke('project-save', input),
  projectList: () => ipcRenderer.invoke('project-list'),
  projectOpenRef: (id: string) => ipcRenderer.invoke('project-open-ref', {id}),
  projectForgetRef: (id: string) => ipcRenderer.invoke('project-forget-ref', {id}),
  projectRelocateRef: (id: string) => ipcRenderer.invoke('project-relocate-ref', {id}),
  projectQueueRef: (id: string) => ipcRenderer.invoke('project-queue-ref', {id}),
  filePendingKind: () => ipcRenderer.invoke('file-pending-kind'),
  filePendingTake: (kind: 'icmal' | 'ekap') => ipcRenderer.invoke('file-pending-take', kind),
  onFilePending: (callback: (kind: 'icmal' | 'ekap') => void) => {
    const handler = (_: Electron.IpcRendererEvent, kind: 'icmal' | 'ekap') => callback(kind);
    ipcRenderer.on('file-pending', handler);
    return () => ipcRenderer.removeListener('file-pending', handler);
  },
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const onMaximize = () => callback(true);
    const onUnmaximize = () => callback(false);
    ipcRenderer.on('window-maximized', onMaximize);
    ipcRenderer.on('window-unmaximized', onUnmaximize);
    return () => {
      ipcRenderer.removeListener('window-maximized', onMaximize);
      ipcRenderer.removeListener('window-unmaximized', onUnmaximize);
    };
  },
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes: string | null }) => void,
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      info: { version: string; releaseNotes: string | null },
    ) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('update-downloaded', callback);
    return () => {
      ipcRenderer.removeListener('update-downloaded', callback);
    };
  },
  onUpdateStatus: (
    callback: (info: { status: 'checking' | 'current' | 'error'; message?: string }) => void,
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      info: { status: 'checking' | 'current' | 'error'; message?: string },
    ) => callback(info);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  localEngineStatus: () => ipcRenderer.invoke('local-engine-status'),
  chooseWorkspace: () => ipcRenderer.invoke('local-engine-choose-workspace'),
  verifyOllama: () => ipcRenderer.invoke('local-engine-verify-ollama'),
  startOllama: () => ipcRenderer.invoke('local-engine-start-ollama'),
  startLocalEngine: () => ipcRenderer.invoke('local-engine-start'),
  stopLocalEngine: () => ipcRenderer.invoke('local-engine-stop'),
  readEngineLogs: () => ipcRenderer.invoke('local-engine-logs'),
  listWorkspace: (path?: string) => ipcRenderer.invoke('workspace-list', path),
  readWorkspaceFile: (path: string) => ipcRenderer.invoke('workspace-read', path),
  writeWorkspaceFile: (input: { path: string; content: string; expectedSha256: string }) =>
    ipcRenderer.invoke('workspace-write', input),
});
