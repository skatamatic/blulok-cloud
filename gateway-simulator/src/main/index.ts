import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { statSync } from 'fs';
import { registerIpcHandlers } from './ipc/ipc-handlers';
import { gatewayManager } from './core/GatewayManager';
import { installAppMenu } from './app-menu';

/** In dev, reload windows when preload rebuilds so contextBridge picks up new API methods. */
function watchPreloadReload(win: BrowserWindow): void {
  if (!process.env.ELECTRON_RENDERER_URL) return;

  const preloadPath = join(__dirname, '../preload/index.mjs');
  let lastMtime = 0;
  try {
    lastMtime = statSync(preloadPath).mtimeMs;
  } catch {
    return;
  }

  setInterval(() => {
    try {
      const mtime = statSync(preloadPath).mtimeMs;
      if (mtime > lastMtime) {
        lastMtime = mtime;
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.reloadIgnoringCache();
        }
      }
    } catch {
      // ignore missing preload during rebuild
    }
  }, 750);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'BluLok Gateway Simulator',
    backgroundColor: '#f9fafb',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  gatewayManager.setWindow(win);

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    watchPreloadReload(win);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  const hydratePromise = gatewayManager.hydrateFromDisk();
  createWindow();
  await hydratePromise;
  installAppMenu({
    undo: () => void gatewayManager.undo(),
    redo: () => void gatewayManager.redo(),
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
