import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { log } from './server';

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  let manualCheck = false;

  ipcMain.handle('install-update', () => {
    if (app.isPackaged) {
      // Install without showing the NSIS wizard and come back up on the new
      // version; a default quitAndInstall() would walk the user through setup.
      autoUpdater.quitAndInstall(true, true);
    }
  });

  // Bekleyen guncelleme dusunce kullanicinin elle tekrar denemesi icin.
  // Sessizdir: manualCheck acilmaz, yani "guncelsiniz" toast'i cikmaz.
  ipcMain.handle('retry-update', () => {
    if (!app.isPackaged) return Promise.resolve(null);
    return autoUpdater.checkForUpdates().catch((err) => {
      console.error('Retry failed:', err);
      mainWindow.webContents.send('update-error');
      return null;
    });
  });

  ipcMain.handle('check-for-updates', () => {
    if (app.isPackaged) {
      manualCheck = true;
      return autoUpdater.checkForUpdates();
    } else {
      mainWindow.webContents.send('update-status', { status: 'current' });
      return Promise.resolve(null);
    }
  });

  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
    if (manualCheck) mainWindow.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('Update available, downloading in background...');
    const notes = Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map((n) => n.note ?? '').join('\n\n')
      : (info.releaseNotes ?? null);
    mainWindow.webContents.send('update-available', { version: info.version, releaseNotes: notes });
    manualCheck = false;
  });

  // Indirme arka planda yapilir ve kullaniciya bildirilmez (urun karari
  // 2026-09-07): kullanici yalnizca "guncelleme var" ve indirme bitince
  // "yeniden baslat" bilgisini gorur. Ilerleme yine gunluge yazilir.
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    log(`Update download ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available.');
    if (manualCheck) mainWindow.webContents.send('update-status', { status: 'current' });
    manualCheck = false;
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Update downloaded, ready to install.');
    mainWindow.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
    // Diyalog acikken bekleyen guncelleme dusmus olabilir; gosterge sonsuza
    // kadar donmesin diye arayuze her durumda bildirilir. Toast yalnizca
    // kullanici elle denetlediyse cikar.
    mainWindow.webContents.send('update-error');
    if (manualCheck) {
      mainWindow.webContents.send('update-status', {
        status: 'error',
        message: 'Güncelleme denetlenemedi. Lütfen daha sonra tekrar deneyin.',
      });
    }
    manualCheck = false;
  });



  const denetle = () =>
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Failed to check for updates:', err);
    });

  // Ilk denetim acilistan kisa sure sonra; ardindan bes dakikada bir
  // (kullanici karari 2026-09-08, onceki deger yarim saatti). Uzun acik kalan
  // pencerelerde yeni surum acilisi beklemeden yakalanir.
  //
  // Denetim yalnizca GitHub release akisini okur; yeni surum yoksa indirme
  // olmaz. Sik denetim kullaniciya gorunmez, cunku indirme de bildirim de
  // arka planda kalir (bkz. update-dialog.tsx).
  const DENETIM_ARALIGI_MS = 5 * 60 * 1000;
  const ilk = setTimeout(denetle, 3000);
  const donemsel = setInterval(denetle, DENETIM_ARALIGI_MS);

  // Pencere kapaninca zamanlayicilar kalmasin.
  mainWindow.on('closed', () => {
    clearTimeout(ilk);
    clearInterval(donemsel);
  });
}
