export {}

const button = document.querySelector<HTMLButtonElement>('#panel')!
const status = document.querySelector<HTMLElement>('#status')!
let last = false
function hitTest(x: number, y: number) {
  const interactive = button.contains(document.elementFromPoint(x, y))
  if (last !== interactive) { last = interactive; window.game.pointer(interactive) }
}
window.addEventListener('mousemove', (event) => hitTest(event.clientX, event.clientY))
window.addEventListener('mouseleave', () => { last = false; window.game.pointer(false) })
window.addEventListener('blur', () => { last = false; window.game.pointer(false) })
button.addEventListener('click', () => window.game.openPanel())
button.addEventListener('contextmenu', (event) => { event.preventDefault(); window.game.openMenu() })
function render(state: Awaited<ReturnType<typeof window.game.getState>>) {
  status.textContent = state.paused ? '一時停止' : '待機中'
}
window.game.onState(render)
void window.game.getState().then(render)
const canvas = document.querySelector<HTMLCanvasElement>('#ground')!
function draw() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  const context = canvas.getContext('2d')!
  context.fillStyle = '#9dbaac55'
  context.fillRect(0, canvas.height - 2, canvas.width, 1)
}
window.addEventListener('resize', draw)
draw()
