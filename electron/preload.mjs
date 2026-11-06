import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clipforge', {
  openFile: (filters = []) => ipcRenderer.invoke('clipforge:open-file', filters),
  saveFile: (options = {}) => ipcRenderer.invoke('clipforge:save-file', options),
  getRecents: () => ipcRenderer.invoke('clipforge:get-recents'),
  onMenuAction: (listener) => {
    const handler = (_event, action) => listener(action);
    ipcRenderer.on('clipforge:menu-action', handler);
    return () => ipcRenderer.removeListener('clipforge:menu-action', handler);
  },
});
