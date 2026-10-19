import type { ShellState } from '../../shared/api'

function render(state: ShellState) {
  document.querySelector('#visible')!.textContent = state.visible ? '表示中' : '非表示'
  document.querySelector('#paused')!.textContent = state.paused ? '一時停止' : '待機中（戦闘未実装）'
  document.querySelector('#profile')!.textContent = state.profile === 'dev' ? '開発用 / .dev-data' : '利用者用'
}
window.game.onState(render)
void window.game.getState().then(render)
