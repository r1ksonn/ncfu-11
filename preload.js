const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ecampus', { logout: () => ipcRenderer.invoke('logout') });
