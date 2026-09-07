export {};

export interface YerelMotorDurumu {
  electron: true;
  calismaKoku: string | null;
  worker: { calisiyor: boolean; pid: number | null; baslamaZamani: string | null };
  ollama: { hazir: boolean; url: string; hata?: string };
}

export interface CalismaAlaniGirdisi {
  ad: string;
  yol: string;
  tur: 'dosya' | 'klasor';
  boyut?: number;
  degistirilmeZamani?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      projectOpen: () => Promise<{token: string; name: string; bytes: Uint8Array} | null>;
      projectSave: (input: {token?: string; name: string; bytes: Uint8Array; saveAs: boolean}) => Promise<{token: string; name: string} | null>;
      projectList: () => Promise<{projects: {id: string; path: string; name: string; openedAt: string; missing: boolean}[]; fault: string | null}>;
      projectOpenRef: (id: string) => Promise<{token: string; name: string; bytes: Uint8Array}>;
      projectForgetRef: (id: string) => Promise<{removed: boolean}>;
      projectRelocateRef: (id: string) => Promise<{token: string; name: string; bytes: Uint8Array} | null>;
      projectQueueRef: (id: string) => Promise<{queued: boolean}>;
      filePendingKind: () => Promise<'icmal' | 'ekap' | null>;
      filePendingTake: {
        (kind: 'icmal'): Promise<{token: string; name: string; bytes: Uint8Array} | null>;
        (kind: 'ekap'): Promise<{name: string; bytes: Uint8Array} | null>;
      };
      onFilePending: (callback: (kind: 'icmal' | 'ekap') => void) => () => void;
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
      windowIsMaximized: () => Promise<boolean>;
      onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
      onUpdateAvailable: (
        callback: (info: { version: string; releaseNotes: string | null }) => void,
      ) => () => void;
      onUpdateDownloaded: (callback: () => void) => () => void;
      onUpdateStatus: (
        callback: (info: { status: 'checking' | 'current' | 'error'; message?: string }) => void,
      ) => () => void;
      installUpdate: () => Promise<void>;
      checkForUpdates: () => Promise<void>;
      localEngineStatus: () => Promise<YerelMotorDurumu>;
      chooseWorkspace: () => Promise<YerelMotorDurumu>;
      verifyOllama: () => Promise<YerelMotorDurumu>;
      startOllama: () => Promise<YerelMotorDurumu>;
      startLocalEngine: () => Promise<YerelMotorDurumu>;
      stopLocalEngine: () => Promise<YerelMotorDurumu>;
      readEngineLogs: () => Promise<string[]>;
      listWorkspace: (path?: string) => Promise<CalismaAlaniGirdisi[]>;
      readWorkspaceFile: (path: string) => Promise<{
        path: string;
        content: string;
        sha256: string;
        language: string;
      }>;
      writeWorkspaceFile: (input: {
        path: string;
        content: string;
        expectedSha256: string;
      }) => Promise<{ path: string; sha256: string; snapshot: string }>;
    };
  }
}
