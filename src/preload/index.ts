import { contextBridge, ipcRenderer } from 'electron'
import { channels, type ShellApi, type ShellState } from '../shared/api'

const api: ShellApi = {
  pointer: (interactive) => ipcRenderer.send(channels.pointer, interactive),
  openPanel: () => ipcRenderer.send(channels.panel),
  openMenu: () => ipcRenderer.send(channels.menu),
  getState: () => ipcRenderer.invoke(channels.getState),
  onState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: ShellState) => listener(state)
    ipcRenderer.on(channels.state, receive)
    return () => ipcRenderer.removeListener(channels.state, receive)
  },
}
contextBridge.exposeInMainWorld('game', api)
