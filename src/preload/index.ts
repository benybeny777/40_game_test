import { contextBridge, ipcRenderer } from 'electron'
import { channels, type ShellApi } from '../shared/api'

function subscribe<T>(channel: string, listener: (value: T) => void) {
  const receive = (_event: Electron.IpcRendererEvent, value: T) => listener(value)
  ipcRenderer.on(channel, receive)
  return () => { ipcRenderer.removeListener(channel, receive) }
}
const api: ShellApi = {
  pointer: (interactive) => ipcRenderer.send(channels.pointer, interactive),
  openPanel: (target) => ipcRenderer.send(channels.panel, target ?? {}),
  openMenu: () => ipcRenderer.send(channels.menu),
  getLayout: () => ipcRenderer.invoke(channels.getLayout),
  onLayout: (listener) => subscribe(channels.layout, listener),
  onFrame: (listener) => subscribe(channels.frame, listener),
  getState: () => ipcRenderer.invoke(channels.getState),
  onState: (listener) => subscribe(channels.state, listener),
  getView: () => ipcRenderer.invoke(channels.getView),
  onView: (listener) => subscribe(channels.view, listener),
  command: (command) => ipcRenderer.invoke(channels.command, command),
  updateSettings: (settings) => ipcRenderer.invoke(channels.settings, settings),
  onNavigate: (listener) => subscribe(channels.navigate, listener),
  openSaveFolder: () => ipcRenderer.send(channels.openSaveFolder),
  exportSave: () => ipcRenderer.send(channels.exportSave),
  retrySave: () => ipcRenderer.invoke(channels.retrySave),
  getStore: () => ipcRenderer.invoke(channels.getStore),
  purchaseProduct: (sku) => ipcRenderer.invoke(channels.purchase, sku),
  equipCosmetic: (sku) => ipcRenderer.invoke(channels.equipCosmetic, sku),
  previewCosmetic: (sku) => ipcRenderer.invoke(channels.previewCosmetic, sku),
  getCloud: () => ipcRenderer.invoke(channels.getCloud),
  cloudCommand: (command) => ipcRenderer.invoke(channels.cloudCommand, command),
}
contextBridge.exposeInMainWorld('game', api)
