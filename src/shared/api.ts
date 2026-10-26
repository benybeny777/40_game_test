import type { Command, CommandResult, JobId, ProfileView, SimEvent, Snapshot } from '../core/index.ts'

export const channels = {
  pointer: 'strip:pointer', panel: 'strip:panel', menu: 'strip:menu',
  layout: 'strip:layout', getLayout: 'strip:get-layout', frame: 'sim:frame',
  state: 'app:state', getState: 'app:get-state',
  view: 'profile:view', getView: 'profile:get', command: 'game:cmd', navigate: 'panel:navigate',
  settings: 'settings:update', openSaveFolder: 'app:open-save-folder',
} as const

export type DisplaySize = 'small' | 'medium' | 'large'
export interface Settings { size: DisplaySize; groundBand: boolean; fpsCap: 15 | 30; hideOnFullscreen: boolean; autoStart: boolean }
export const defaultSettings: Settings = { size: 'medium', groundBand: true, fpsCap: 30, hideOnFullscreen: true, autoStart: false }
export interface ShellState { paused: boolean; visible: boolean; profile: 'dev' | 'user'; settings: Settings
  packaged: boolean; fullscreenHidden: boolean; fullscreenSupported: boolean }
export interface StripLayout { dotPx: number; playDots: number; scaleFactor: number; headroomDip: number }
export interface Frame { snapshot: Snapshot; events: SimEvent[] }
export type PanelTab = 'party' | 'gear' | 'dojo' | 'stage' | 'dex' | 'settings'
export interface PanelTarget { tab?: PanelTab; job?: JobId }

export interface ShellApi {
  // strip
  pointer(interactive: boolean): void
  openPanel(target?: PanelTarget): void
  openMenu(): void
  getLayout(): Promise<StripLayout>
  onLayout(listener: (layout: StripLayout) => void): () => void
  onFrame(listener: (frame: Frame) => void): () => void
  // both
  getState(): Promise<ShellState>
  onState(listener: (state: ShellState) => void): () => void
  // panel
  getView(): Promise<ProfileView>
  onView(listener: (view: ProfileView) => void): () => void
  command(command: Command): Promise<CommandResult>
  updateSettings(settings: Partial<Settings>): Promise<ShellState>
  onNavigate(listener: (target: PanelTarget) => void): () => void
  openSaveFolder(): void
}

declare global { interface Window { game: ShellApi } }
