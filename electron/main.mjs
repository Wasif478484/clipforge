import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isPackaged = app.isPackaged;

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 680,
    backgroundColor: '#0a0b0e',
    title: 'ClipForge',
    icon: path.join(dirname, '..', 'build', 'icon.png'),
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      preload: path.join(dirname, 'preload.mjs'),
    },
  });

  win.once('ready-to-show', () => win.show());

  // Never open new windows/tabs; send http(s) links to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isPackaged || !url.startsWith('http://localhost')) {
      event.preventDefault();
      openExternal(url);
    }
  });

  if (isPackaged) {
    void win.loadFile(path.join(dirname, '..', 'dist', 'index.html'));
  } else {
    void win.loadURL(process.env.CLIPFORGE_DEV_URL ?? 'http://localhost:5173');
  }

  ipcMain.handle('clipforge:open-file', async (_event, filters = []) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('clipforge:save-file', async (_event, options = {}) => {
    const result = await dialog.showSaveDialog(options);
    return result.canceled ? null : result.filePath ?? null;
  });

  ipcMain.handle('clipforge:get-recents', () => app.getRecentDocuments());
}

function appMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('clipforge:menu-action', 'open-project'),
        },
        {
          label: 'Save project',
          accelerator: 'CmdOrCtrl+S',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('clipforge:menu-action', 'save-project'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        {
          label: 'Import media…',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('clipforge:menu-action', 'import-media'),
        },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' },
        ...(isPackaged ? [] : [{ role: 'toggleDevTools' }, { role: 'reload' }]),
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About ClipForge',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About ClipForge',
              message: 'ClipForge',
              detail: `Version ${app.getVersion()}\n\nFree, open-source video editor for the browser and desktop.\nNot affiliated with CapCut or ByteDance.\n\nAll media stays on your device — nothing is uploaded.`,
              buttons: ['OK'],
            }).catch(() => undefined);
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  appMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error('Failed to start app:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
