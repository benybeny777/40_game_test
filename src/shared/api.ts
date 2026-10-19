export const channels = {
  pointer: 'strip:pointer', panel: 'strip:panel', menu: 'strip:menu',
  state: 'app:state', getState: 'app:get-state',
} as const

export interface ShellState { paused: boolean; visible: boolean; profile: 'dev' | 'user' }
export interface ShellApi {
  pointer(interactive: boolean): void
  openPanel(): void
  openMenu(): void
  getState(): Promise<ShellState>
  onState(listener: (state: ShellState) => void): () => void
}

declare global { interface Window { game: ShellApi } }
