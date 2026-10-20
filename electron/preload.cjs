const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boothAPI', {
  getSaveDirectory: () => ipcRenderer.invoke('booth:get-save-directory'),
  savePhoto: (payload) => ipcRenderer.invoke('booth:save-photo', payload),
  printPhoto: (payload) => ipcRenderer.invoke('booth:print-photo', payload),
  openFolder: (folderPath) => ipcRenderer.invoke('booth:open-folder', folderPath),
  getNetworkInfo: () => ipcRenderer.invoke('booth:get-network-info'),
  publishPhoto: (payload) => ipcRenderer.invoke('booth:publish-photo', payload),
  onPhonePhoto: (callback) => {
    const listener = (_event, dataUrl) => callback(dataUrl);
    ipcRenderer.on('booth:phone-photo', listener);
    return () => ipcRenderer.removeListener('booth:phone-photo', listener);
  },
  isElectron: true
});
