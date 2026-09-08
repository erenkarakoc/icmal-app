import { app, BrowserWindow, dialog, ipcMain, shell, session } from 'electron';
import fs from 'node:fs';
import { registerProjectFiles, registerProjectCloseGuard } from './project-files';
import { documentPathFromArgv } from './project-launch';
import { registerFileHandover } from './file-handover';
import { ProjectRegistry } from './project-registry';
import path from 'node:path';
import { startServer, stopServer, initLog, log } from './server';
import { APP_NAME, APP_ID, userDataPath } from './identity';
import { initAutoUpdater } from './updater';
import {
  chooseWorkspace,
  getEngineStatus,
  listWorkspace,
  readEngineLogs,
  readWorkspaceFile,
  startLocalEngine,
  stopAllManagedProcesses,
  stopLocalEngine,
  writeWorkspaceFile,
} from './local-engine';

// Resolve the legacy profile before Electron initializes its default session.
app.setPath('userData', userDataPath(app.getPath('appData'), app.isPackaged));
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

const isDev = !app.isPackaged;
const DEV_SERVER_URL = 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;
let serverUrl: string = DEV_SERVER_URL;
let fileHandover: { handOver(target: string): void } | null = null;
let launchDocumentPath: string | null = null;

function openDocumentPath(target: string): void {
  log(`Document handover requested: ${path.basename(target)}`);
  if (!mainWindow || !fileHandover) {
    launchDocumentPath = target;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  fileHandover.handOver(target);
}

// A second launch must reuse this window instead of starting a rival instance.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const target = documentPathFromArgv(argv);
    if (target) openDocumentPath(target);
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS delivers the path through an event rather than argv.
app.on('open-file', (event, target) => {
  event.preventDefault();
  openDocumentPath(target);
});

launchDocumentPath = documentPathFromArgv(process.argv);

function getHostedWebUrl(resourcesPath: string): string | null {
  try {
    const configPath = path.join(resourcesPath, 'app-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { webUrl?: string };
    const value = config.webUrl?.trim();
    if (!value) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Production web URL must use HTTPS');
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    log(
      `Hosted web configuration not active: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#000000',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
  });

  const origin = new URL(serverUrl).origin;
  const registry = new ProjectRegistry(path.join(app.getPath('userData'), 'yerel-projeler.json'));
  const projectFiles = registerProjectFiles(mainWindow, origin, registry);
  fileHandover = registerFileHandover(mainWindow, origin, projectFiles.adopt, registry);
  registerProjectCloseGuard(mainWindow);
  mainWindow.loadURL(serverUrl);

  // Show window when content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Notify renderer of maximize/unmaximize state changes
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized');
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-unmaximized');
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Navigate external links in default browser instead of in-app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    const appUrl = new URL(serverUrl);
    if (parsedUrl.origin !== appUrl.origin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Security: Set CSP headers based on actual server origin
function setupCSP(): void {
  const origin = new URL(serverUrl);
  const httpOrigin = origin.origin;
  const wsOrigin = httpOrigin.replace(/^http/, 'ws');
  const scriptRelaxations = isDev ? "'unsafe-inline' 'unsafe-eval'" : "'unsafe-inline'";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self' ${httpOrigin} ${wsOrigin}; ` +
            `script-src 'self' ${scriptRelaxations} ${httpOrigin}; ` +
            `style-src 'self' 'unsafe-inline' ${httpOrigin} https://fonts.googleapis.com; ` +
            `font-src 'self' https://fonts.gstatic.com; ` +
            `img-src 'self' data: blob: ${httpOrigin}; ` +
            `connect-src 'self' ${httpOrigin} ${wsOrigin} https://*.supabase.co wss://*.supabase.co; ` +
            `worker-src 'self' blob:`,
        ],
      },
    });
  });
}

// Window control IPC handlers
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('local-engine-status', () => getEngineStatus());
ipcMain.handle('local-engine-choose-workspace', () => chooseWorkspace());
ipcMain.handle('local-engine-start', () => startLocalEngine());
ipcMain.handle('local-engine-stop', () => stopLocalEngine());
ipcMain.handle('local-engine-logs', () => readEngineLogs());
ipcMain.handle('workspace-list', (_event, relativePath?: string) => listWorkspace(relativePath));
ipcMain.handle('workspace-read', (_event, relativePath: string) => readWorkspaceFile(relativePath));
ipcMain.handle(
  'workspace-write',
  (_event, input: { path: string; content: string; expectedSha256: string }) =>
    writeWorkspaceFile(input),
);

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  initLog(isDev ? undefined : process.resourcesPath);

  if (!isDev) {
    const hostedUrl = getHostedWebUrl(process.resourcesPath);
    if (hostedUrl) {
      serverUrl = hostedUrl;
      log(`Using hosted web application at ${new URL(serverUrl).origin}`);
    } else {
      try {
        serverUrl = await startServer(process.resourcesPath);
        log(`Local fallback server started at ${serverUrl}`);
      } catch (err) {
        log(
          `Failed to start server: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
        );
        console.error('Failed to start Next.js server:', err);
        dialog.showErrorBox(
          APP_NAME,
          `Sunucu başlatılamadı:\n${err instanceof Error ? err.message : String(err)}`,
        );
        app.quit();
        return;
      }
    }
  }

  setupCSP();
  createWindow();
  initAutoUpdater(mainWindow!);

  if (launchDocumentPath) {
    const target = launchDocumentPath;
    launchDocumentPath = null;
    openDocumentPath(target);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  stopAllManagedProcesses();
  stopServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
