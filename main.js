const { app, BrowserWindow, Menu, shell, ipcMain, session } = require('electron');
const path = require('path');

const PARTITION = 'persist:ncfu';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    title: 'Ecampus',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f4f6fb',
    webPreferences: { webviewTag: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

// Ссылки «открыть в новом окне» внутри сайтов открываем в том же встроенном окне
app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() === 'webview') {
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\/([a-z0-9-]+\.)*ncfu\.ru\//i.test(url)) wc.loadURL(url);
      else shell.openExternal(url);
      return { action: 'deny' };
    });
  }
});

// Выход из аккаунта: стираем cookies сайтов СКФУ
ipcMain.handle('logout', async () => {
  await session.fromPartition(PARTITION).clearStorageData();
  return true;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
