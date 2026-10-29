import { jobs, partyOrder } from '../../core/index.ts'
import { artReady, frameAt, sheets } from '../strip/sprites/sheet'
import { gaitTiming, walkPose } from '../strip/gait'

const root = document.querySelector('#jobs')!
let paused = false, distance = 0, last = 0
const pause = document.querySelector<HTMLButtonElement>('#pause')!
pause.onclick = () => { paused = !paused; pause.textContent = paused ? '再開' : '一時停止' }
void artReady.then(() => {
  const cards = partyOrder.map((id, slot) => {
    const sheet = sheets[id]
    if (sheet.anims.walk.frames.length !== gaitTiming.frames) throw new Error(`${id}: wrong walk frame count`)
    const card = document.createElement('article'), title = document.createElement('h2'), canvas = document.createElement('canvas'), label = document.createElement('small')
    title.textContent = jobs[id].name; canvas.width = 208; canvas.height = 200
    card.append(title, canvas, label); root.append(card)
    return { id, slot, sheet, ctx: canvas.getContext('2d')!, label }
  })
  function draw(now: number) {
    const elapsed = last ? Math.min(100, now - last) : 0; last = now
    if (!paused) distance += elapsed * gaitTiming.dotsPerSecond / 1000
    for (const { id, slot, sheet, ctx, label } of cards) {
      const pose = walkPose(id, slot, distance), frame = frameAt(sheet, 'walk', pose.elapsedMs)
      ctx.clearRect(0, 0, 208, 200); ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#85958e'; ctx.fillRect(0, 184, 208, 1)
      ctx.fillStyle = '#48534e'
      for (let x = -distance % 12 * 4; x < 208; x += 48) ctx.fillRect(Math.round(x), 188, 8, 2)
      ctx.fillStyle = '#0009'; ctx.fillRect(104 - pose.shadowWidth * 2, 182, pose.shadowWidth * 4, 3)
      ctx.drawImage(frame.normal, Math.round(104 - frame.normal.width * 2 + pose.dx * 4), Math.round(184 - sheet.height * 4 + pose.dy * 4), frame.normal.width * 4, frame.normal.height * 4)
      label.textContent = `frame ${pose.frame + 1}/5 · ${id}`
    }
    requestAnimationFrame(draw)
  }
  requestAnimationFrame(draw)
}).catch(error => { console.error('Walk preview failed', error); document.querySelector('#error')!.textContent = error instanceof Error ? error.message : String(error) })
