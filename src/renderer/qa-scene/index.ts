import { dungeons, jobs, partyOrder, type JobId } from '../../core/index.ts'
import { Scene } from '../strip/scene'
import { GAME_SPEED } from '../../core/data/timing'
import { artReady } from '../strip/sprites/sheet'
import { sceneFixture, type Cue, type PreviewMode } from './fixture'

const job = document.querySelector<HTMLSelectElement>('#job')!, biome = document.querySelector<HTMLSelectElement>('#biome')!
const mode = document.querySelector<HTMLSelectElement>('#mode')!, scale = document.querySelector<HTMLSelectElement>('#scale')!
const background = document.querySelector<HTMLInputElement>('#background')!, pause = document.querySelector<HTMLButtonElement>('#pause')!
const time = document.querySelector<HTMLInputElement>('#time')!, clock = document.querySelector<HTMLOutputElement>('#clock')!
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!, context = canvas.getContext('2d')!
const events = document.querySelector<HTMLDivElement>('#events')!, contact = document.querySelector<HTMLDivElement>('#contact')!
const error = document.querySelector<HTMLParagraphElement>('#error')!
for (const id of partyOrder) job.add(new Option(`${jobs[id].name} · ${id}`, id))
dungeons.yomi.biomes.forEach((name, index) => biome.add(new Option(name, String(index))))

class Preview {
  private scene: Scene
  private cursor = 0
  private age = 0
  constructor(private readonly cues: Cue[], private readonly ctx: CanvasRenderingContext2D, groundBand: boolean, message: (text: string) => void = () => {}) {
    this.scene = new Scene({ banner: message, label: message })
    this.scene.W = ctx.canvas.width; this.scene.H = ctx.canvas.height; this.scene.groundBand = groundBand
  }
  drawTo(age: number) {
    if (age < this.age) throw new Error('Recreate the preview before seeking backward')
    // Step the real drawing clock so walking distance is deterministic during a slider seek.
    for (let at = this.age; at <= age; at = Math.min(age, at + 40)) {
      while (this.cursor < this.cues.length && this.cues[this.cursor].at <= at) {
        const cue = this.cues[this.cursor++]
        this.scene.ingest({ snapshot: cue.snapshot, events: cue.events }, 1000 + cue.at)
      }
      this.ctx.imageSmoothingEnabled = false
      this.scene.draw(this.ctx, 1000 + at)
      if (at === age) break
    }
    this.age = age
  }
}

let ready = false, paused = false, age = 0, last = 0, preview: Preview | undefined
const selectedCues = () => sceneFixture(job.value as JobId, Number(biome.value), mode.value as PreviewMode).map(cue => ({ ...cue, at: cue.at / GAME_SPEED }))
time.max = String(3200 / GAME_SPEED)
function makePreview() {
  events.textContent = ''
  const messages: string[] = []
  preview = new Preview(selectedCues(), context, background.checked, text => {
    messages.push(text); events.textContent = messages.slice(-4).join('\n')
  })
}
function fixedFrames() {
  contact.replaceChildren()
  const times = mode.value === 'loot' ? [0, 450, 1100, 1600, 2200, 2900] : mode.value === 'boss' || mode.value === 'interrupt' ? [0, 400, 800, 1200, 1600, 2000] : mode.value === 'walking' ? [0, 160, 320, 480, 640, 800] : [0, 60, 100, 180, 320, 600]
  for (const simulatedAt of times) {
    const at = simulatedAt / GAME_SPEED
    const card = document.createElement('article'), label = document.createElement('h2'), frame = document.createElement('canvas')
    label.textContent = `${jobs[job.value as JobId].name} · ${at} ms`; frame.width = 384; frame.height = 112
    new Preview(selectedCues(), frame.getContext('2d')!, background.checked).drawTo(at)
    card.append(label, frame); contact.append(card)
  }
}
function reset() {
  if (!ready) return
  age = 0; last = 0; makePreview(); fixedFrames(); draw()
}
function draw() { preview?.drawTo(age); time.value = String(Math.round(age)); clock.textContent = `${Math.round(age)} ms` }
function guarded(operation: () => void) {
  try { operation() } catch (failure) { paused = true; console.error('Scene preview failed', failure); error.textContent = failure instanceof Error ? failure.stack ?? failure.message : String(failure) }
}
for (const control of [job, biome, mode, background]) control.addEventListener('change', () => guarded(reset))
scale.addEventListener('change', () => { canvas.style.width = `${384 * Number(scale.value)}px`; canvas.style.height = `${112 * Number(scale.value)}px` })
document.querySelector('#replay')!.addEventListener('click', () => guarded(() => { paused = false; pause.textContent = '一時停止'; reset() }))
pause.addEventListener('click', () => { paused = !paused; pause.textContent = paused ? '再開' : '一時停止'; last = 0 })
time.addEventListener('input', () => guarded(() => { paused = true; pause.textContent = '再開'; age = Number(time.value); makePreview(); draw() }))
void artReady.then(() => {
  ready = true; guarded(reset)
  function frame(now: number) {
    if (!paused) guarded(() => {
      age += last ? Math.min(100, now - last) : 0
      if (age > 3200 / GAME_SPEED) { age = 0; makePreview() }
      draw()
    })
    last = now; requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}).catch(failure => { console.error('Scene art failed', failure); error.textContent = String(failure) })
