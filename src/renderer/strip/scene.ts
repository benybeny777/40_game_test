import { balance, enemies, jobs, partySize, rarities, stageLabel, type JobId, type SimEvent, type Snapshot, type SnapshotUnit } from '../../core/index.ts'
import type { Frame as SimFrame } from '../../shared/api'
import { drawText, textWidth } from './font'
import { frameAt, sheets, type Sheet } from './sprites/sheet'
import { PARTY_SPACING_SCALE, PLAY_DOTS } from '../../shared/art'
import type { ThemeDefinition } from '../../shared/commerce'
import { damageText, enemyMotion, enemyRank, enemyScale } from './enemyPresentation'
import { drawDungeonBackground } from './background'
import { actionPose, actionTiming, hitRecoil, meleeDashDistance, normalWindupMs } from './actionPresentation'

/** Vertical layout inside the 32-dot play area (02-strip.md §3). Everything above it is headroom. */
const PLAY = PLAY_DOTS, FOOT_FROM_TOP = PLAY_DOTS - 3
const PHANTOMS = new Set(['kyubi_phantom'])
/** Derived enemies (split pieces, phantoms) reuse another enemy's sprite. */
const sheetOf = (defId: string): Sheet | undefined => sheets[defId] ?? sheets[enemies[defId]?.sprite ?? '']
const MAX_NUMBERS = 30
const ENEMY_DRAW_OFFSET = 4
const colors = { hp: '#63b93b', hpLow: '#e8483e', enemyHp: '#e8483e', bar: '#15131c', ult: '#ffe27a', jonen: '#ff6fb0',
  dmg: '#ffffff', crit: '#ffe27a', heal: '#9df07a', miss: '#8d8ea6', gold: '#ffe27a', hudBg: 'rgba(21,24,36,0.88)', hudLine: '#d9a52c' }

// 夜の街道（土と草）／シャッター商店街（灰のタイルと自販機の光）／電脳街（黒地に青い線）
const GROUNDS = [
  { band: 'rgba(14,16,26,0.38)', line: 'rgba(157,186,172,0.55)', dotA: 'rgba(110,130,90,0.8)', dotB: 'rgba(120,110,100,0.7)', prop: 'rgba(99,185,59,0.7)', propHeight: 1 },
  { band: 'rgba(22,22,28,0.42)', line: 'rgba(170,170,180,0.6)', dotA: 'rgba(140,140,150,0.8)', dotB: 'rgba(110,110,120,0.7)', prop: 'rgba(255,226,122,0.75)', propHeight: 3 },
  { band: 'rgba(6,10,26,0.5)', line: 'rgba(47,143,255,0.7)', dotA: 'rgba(159,228,255,0.8)', dotB: 'rgba(47,143,255,0.6)', prop: 'rgba(180,255,90,0.75)', propHeight: 2 },
]
interface Visual { uid: number; defId: string; side: SnapshotUnit['side']; sheet: Sheet; anim?: string; animAt: number
  flashUntil: number; knockUntil: number; deadAt?: number; spawnAt: number; targetUid?: number
  windupMs?: number; ranged?: boolean; hitAt?: number; hitX?: number; critical?: boolean
  normalMelee?: boolean; dashTargetX?: number; drawX?: number; drawY?: number }
interface Floater { uid: number; text: string; x: number; y: number; color: string; start: number; dur: number; big?: boolean }
interface Fx { kind: 'smoke' | 'boom' | 'slash' | 'flash' | 'sparkle' | 'impact'; x: number; y: number; start: number; dur: number; radius: number; color: string }
interface Coin { x: number; y: number; vx: number; vy: number; start: number }
export type HitTarget = { kind: 'unit'; unit: SnapshotUnit } | { kind: 'hud' }
export interface SceneHooks { banner(text: string, tone: 'info' | 'boss' | 'good' | 'bad'): void; label(text: string, dotX: number, dotY: number, color: string): void }

export class Scene {
  W = 0; H = 0
  groundBand = true
  appearance: ThemeDefinition | null = null
  private prev?: Snapshot
  cur?: Snapshot
  private curAt = 0
  private gap: number = balance.tickMs
  private visuals = new Map<number, Visual>()
  private numbers: Floater[] = []
  private fx: Fx[] = []
  private coins: Coin[] = []
  private loot: Array<{ x: number; y: number; start: number; color: string }> = []
  private ground = 0
  private lastDraw = 0
  private hud = { x: 0, y: 0, w: 0, h: 0 }

  constructor(private readonly hooks: SceneHooks) {}

  get footY() { return this.H - PLAY + FOOT_FROM_TOP }
  get baseX() { return Math.floor(this.W * 0.12) + (partySize - 1) * balance.formationGap * PARTY_SPACING_SCALE }
  // Enemies are drawn a few dots further right so melee contact (14 dots in the sim) does not overlap sprites.
  private screenX(x: number, enemy = false) { return this.baseX + x * PARTY_SPACING_SCALE + (enemy ? ENEMY_DRAW_OFFSET : 0) }

  ingest(frame: SimFrame, now: number) {
    const first = !this.cur
    this.prev = this.cur ?? frame.snapshot
    if (this.cur) this.gap = Math.min(300, Math.max(50, now - this.curAt))
    this.cur = frame.snapshot; this.curAt = now
    for (const unit of frame.snapshot.units) if (!this.visuals.has(unit.uid)) {
      const sheet = sheetOf(unit.defId) ?? sheets.chochin
      this.visuals.set(unit.uid, { uid: unit.uid, defId: unit.defId, side: unit.side, sheet, animAt: 0, flashUntil: 0, knockUntil: 0,
        spawnAt: unit.side === 'enemy' && !first ? now : 0, deadAt: unit.alive ? undefined : now - 1000 })
    }
    const alive = new Set(frame.snapshot.units.map((unit) => unit.uid))
    for (const uid of this.visuals.keys()) if (!alive.has(uid)) this.visuals.delete(uid)
    for (const event of frame.events) this.event(event, now)
  }

  private unit(uid: number) { return this.cur?.units.find((unit) => unit.uid === uid) }
  private posX(uid: number, alpha: number) {
    const now = this.cur?.units.find((unit) => unit.uid === uid)
    if (!now) return undefined
    const before = this.prev?.units.find((unit) => unit.uid === uid) ?? now
    return this.screenX(before.x + (now.x - before.x) * alpha, now.side === 'enemy')
  }
  private chestY(unit: SnapshotUnit) { return this.footY - Math.floor((this.footY - this.headY(unit)) * 0.55) }
  private headY(unit: SnapshotUnit) { const sheet = sheetOf(unit.defId); return this.footY - Math.round((sheet ? sheet.height - sheet.top : 20) * (unit.side === 'enemy' ? enemyScale(unit.defId) : 1)) }
  private number(text: string, uid: number, color: string, now: number, big = false) {
    const unit = this.unit(uid), x = this.posX(uid, 1)
    if (!unit || x === undefined) return
    if (this.numbers.length >= MAX_NUMBERS) this.numbers.shift()
    const jitter = ((uid * 7 + this.numbers.length * 5) % 7) - 3
    // Recent numbers on the same target stack upward instead of overprinting each other.
    const stacked = this.numbers.filter((number) => number.uid === uid && now - number.start < 350).length % 4
    this.numbers.push({ uid, text, x: x + jitter, y: this.headY(unit) - 3 - stacked * 7, color, start: now, dur: big ? 650 : 440, big })
  }

  private event(event: SimEvent, now: number) {
    const vis = 'uid' in event ? this.visuals.get(event.uid) : undefined
    switch (event.t) {
      case 'attack':
        if (vis) { vis.anim = 'attack'; vis.animAt = now; vis.targetUid = event.targetUid; vis.windupMs = normalWindupMs(); vis.ranged = event.kind === 'ranged'
          vis.normalMelee = vis.side === 'ally' && event.kind === 'melee'; vis.dashTargetX = this.posX(event.targetUid, 1) }
        break
      case 'damage': {
        if (vis && event.amount > 0) {
          const repeat = vis.hitAt === now
          vis.flashUntil = now + actionTiming.flashMs; vis.knockUntil = now + actionTiming.knockMs
          vis.hitAt = now; vis.hitX = this.posX(event.uid, 1); vis.critical = event.crit
          const unit = this.unit(event.uid)
          if (!repeat && unit && vis.hitX !== undefined && this.fx.filter(fx => fx.kind === 'impact').length < 12) this.fx.push({ kind: 'impact', x: vis.hitX, y: this.chestY(unit), start: now, dur: actionTiming.sparkMs, radius: event.crit ? 7 : 4, color: event.crit ? '#ffe27a' : '#fff0d9' })
          const source = this.visuals.get(event.sourceUid)
          // A melee hit is authoritative; ranged impact must not replay the earlier throwing motion.
          if (source?.anim === 'attack' && !source.ranged && source.windupMs && Math.abs(now - source.animAt - source.windupMs) <= balance.tickMs * 2) source.animAt = now - source.windupMs
        }
        const big = event.crit || Boolean(event.tags?.length)
        this.number(damageText(event.amount), event.uid, event.crit ? colors.crit : colors.dmg, now, big)
        break
      }
      case 'miss': this.number('MISS', event.uid, colors.miss, now); break
      case 'heal': if (event.sourceUid !== event.uid && event.amount >= 1) this.number(`+${Math.round(event.amount)}`, event.uid, colors.heal, now); break
      case 'skill': {
        if (vis) { vis.anim = 'attack'; vis.animAt = now; vis.windupMs = 0; vis.normalMelee = false }
        const unit = this.unit(event.uid), x = this.posX(event.uid, 1)
        const name = unit?.side === 'ally' ? jobs[unit.defId as JobId].skill.name : event.skillId === 'phantom' ? '幻影分身' : enemies[unit?.defId ?? '']?.boss?.skill.name
        if (unit && x !== undefined && name && event.skillId !== 'kakuhen') this.hooks.label(name, x, this.headY(unit) - 6, unit.side === 'ally' ? jobs[unit.defId as JobId].color : '#ff8a6a')
        break
      }
      case 'ultimate': {
        const unit = this.unit(event.uid)
        if (vis) { vis.anim = 'attack'; vis.animAt = now; vis.windupMs = balance.ultCastMs; vis.normalMelee = false }
        if (unit) {
          const job = jobs[unit.defId as JobId]
          this.hooks.banner(event.skillId === 'oatari' ? `${job.ultimate.name} ${event.roll ?? '?'}${event.roll === 7 ? '！！' : ''}` : job.ultimate.name, event.roll === 7 ? 'good' : 'info')
          const x = this.posX(event.uid, 1)
          if (x !== undefined) this.fx.push({ kind: 'sparkle', x, y: this.chestY(unit), start: now, dur: balance.ultCastMs, radius: 12, color: job.color })
          if (event.skillId === 'issen') this.fx.push({ kind: 'flash', x: 0, y: 0, start: now + balance.ultCastMs, dur: 90, radius: 0, color: '#ffffff' })
        }
        break
      }
      case 'death': if (vis) vis.deadAt = now; break
      case 'revive': if (vis) vis.deadAt = undefined; break
      case 'spawn': {
        if (vis) vis.spawnAt = now
        const x = this.posX(event.uid, 1)
        if (x !== undefined) this.fx.push({ kind: 'smoke', x, y: this.footY - 8, start: now, dur: 450, radius: 9, color: '#dcdcea' })
        break
      }
      case 'phase': {
        const label = stageLabel(event.stageNo).label
        if (event.phase === 'bossIntro') this.hooks.banner('ボス出現！', 'boss')
        if (event.phase === 'stageClear') this.hooks.banner(`${label} 踏破！`, 'good')
        if (event.phase === 'wipe') this.hooks.banner('全滅… ウェーブ1から', 'bad')
        if (event.phase === 'walking' && event.wave === 1) this.hooks.banner(`地下 ${event.stageNo} 階`, 'info')
        if (event.phase === 'town') this.hooks.banner('街へ帰還しました', 'info')
        break
      }
      case 'floorEvent': this.hooks.banner(event.kind === 'treasure' ? '宝箱を発見！' : '祭壇の祝福', 'good'); break
      case 'kakuhen': {
        const unit = this.unit(event.uid), x = this.posX(event.uid, 1)
        if (unit && x !== undefined) this.hooks.label(event.hit ? '確変突入！' : 'ハズレ', x, this.headY(unit) - 6, event.hit ? '#ffe27a' : '#8d8ea6')
        if (event.hit && x !== undefined && unit) this.fx.push({ kind: 'sparkle', x, y: this.chestY(unit), start: now, dur: 900, radius: 14, color: '#ffe27a' })
        break
      }
      case 'reward': {
        const count = Math.min(4, 1 + Math.floor(event.koban / 8))
        for (let i = 0; i < count; i++) this.coins.push({ x: this.screenX(event.x, true), y: this.footY - 10, vx: (i - count / 2) * 9 + 6, vy: -28 - i * 4, start: now })
        break
      }
      case 'explode': this.fx.push({ kind: 'boom', x: this.screenX(event.x, true), y: this.footY - 6, start: now, dur: 380, radius: Math.min(16, event.radius), color: '#ffe27a' }); break
      case 'drop': {
        const rarity = rarities[event.rarity]
        this.loot.push({ x: this.screenX(event.x, true), y: this.footY - 10, start: now, color: rarity.color })
        if (event.rarity >= 2) this.hooks.label(`${rarity.name}「${event.name}」`, this.screenX(event.x, true), this.footY - 26, rarity.color)
        if (event.rarity >= 3) this.hooks.banner(`${rarity.name}の装備！ ${event.name}`, 'good')
        if (event.equippedBy) {
          const ally = this.cur?.units.find((unit) => unit.side === 'ally' && unit.defId === event.equippedBy)
          if (ally) this.number('EQUIP', ally.uid, rarity.color, now)
        }
        break
      }
      case 'levelUp': {
        const ally = this.cur?.units.find((unit) => unit.side === 'ally' && unit.defId === event.job)
        if (ally) this.number(`LV${event.lv}`, ally.uid, colors.gold, now, true)
        break
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number) {
    const dt = this.lastDraw ? Math.min(100, now - this.lastDraw) : 0
    this.lastDraw = now
    ctx.clearRect(0, 0, this.W, this.H)
    const snap = this.cur
    if (!snap) return
    const alpha = Math.min(1, Math.max(0, (now - this.curAt) / this.gap))
    const renderTick = (this.prev?.tick ?? snap.tick) + alpha * (snap.tick - (this.prev?.tick ?? snap.tick))
    if (snap.phase === 'walking') this.ground = (this.ground + dt * 0.05) % 4096
    if (this.groundBand) {
      drawDungeonBackground(ctx, { width: this.W, height: this.H, footY: this.footY, baseX: this.baseX, depth: snap.stageNo, town: snap.phase === 'town', walkOffset: this.ground })
      this.drawGround(ctx, Math.floor((snap.stageNo - 1) / 5))
    }
    this.drawThreats(ctx, snap, alpha)
    for (const mine of snap.mines) {
      const blink = mine.explodeTick - renderTick < 10 ? Math.floor(now / 80) % 2 : Math.floor(now / 250) % 2
      this.sprite(ctx, sheets.projectiles, 'mine', blink * 250, this.screenX(mine.x, true), this.footY, false)
    }
    const order = [...snap.units].sort((a, z) => (a.side === z.side ? z.slot - a.slot : a.side === 'enemy' ? -1 : 1))
    for (const unit of order) this.drawUnit(ctx, unit, now, alpha, snap)
    for (const unit of order) if (unit.alive) this.drawBars(ctx, unit, alpha, now, snap)
    for (const projectile of snap.projectiles) {
      const from = this.posX(projectile.fromUid, alpha), to = this.posX(projectile.toUid, alpha)
      const source = this.unit(projectile.fromUid), target = this.unit(projectile.toUid)
      if (from === undefined || to === undefined || !source || !target) continue
      const t = Math.min(1, Math.max(0, (renderTick - projectile.launchTick) / Math.max(1, projectile.hitTick - projectile.launchTick)))
      const y0 = this.chestY(source), y1 = this.chestY(target)
      const arc = projectile.kind === 'ball' || projectile.kind === 'penlight' ? Math.sin(Math.PI * t) * 7 : 0
      this.sprite(ctx, sheets.projectiles, projectile.kind, now, from + (to - from) * t, y0 + (y1 - y0) * t - arc + 3, source.side === 'enemy')
    }
    this.drawFx(ctx, now)
    this.drawCoins(ctx, now)
    this.drawLoot(ctx, now)
    this.drawNumbers(ctx, now)
    this.drawHud(ctx, snap)
  }

  private drawGround(ctx: CanvasRenderingContext2D, area: number) {
    const y = this.footY + 1
    const theme = this.appearance ?? GROUNDS[area % GROUNDS.length]
    if (this.groundBand) { ctx.fillStyle = theme.band; ctx.fillRect(0, y - 7, this.W, 9) }
    ctx.fillStyle = theme.line; ctx.fillRect(0, y, this.W, 1)
    const offset = Math.floor(this.ground)
    for (let i = -1; i < this.W / 13 + 1; i++) {
      const x = ((i * 13 - offset) % this.W + this.W) % this.W
      ctx.fillStyle = i % 3 === 0 ? theme.dotA : theme.dotB
      ctx.fillRect(x, y + 1, i % 3 === 0 ? 2 : 1, 1)
      if (i % 5 === 0) { ctx.fillStyle = theme.prop; ctx.fillRect(x + 4, y - 1, 1, 1); ctx.fillRect(x + 6, y - theme.propHeight, 1, theme.propHeight) }
    }
  }

  private sprite(ctx: CanvasRenderingContext2D, sheet: Sheet | undefined, anim: string, elapsed: number, x: number, footY: number, flip: boolean, mode: 'normal' | 'flash' | 'gray' = 'normal', scale = 1, deform = { width: 0, height: 0 }) {
    if (!sheet) return
    const frame = frameAt(sheet, anim, elapsed)[mode]
    const width = Math.max(1, Math.round(frame.width * scale) + deform.width), height = Math.max(1, Math.round(frame.height * scale) + deform.height)
    const left = Math.round(x), top = Math.round(footY - height * sheet.anchor[1] / sheet.height), anchor = Math.round(width * sheet.anchor[0] / sheet.width)
    if (!flip) { ctx.drawImage(frame, left - anchor, top, width, height); return }
    ctx.save(); ctx.translate(left, 0); ctx.scale(-1, 1); ctx.drawImage(frame, -anchor, top, width, height); ctx.restore()
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: SnapshotUnit, now: number, alpha: number, snap: Snapshot) {
    const vis = this.visuals.get(unit.uid)
    let x = this.posX(unit.uid, alpha)
    if (!vis || x === undefined) return
    // Production heroes face right and the enemy atlas already faces left.
    const flip = false
    const scale = unit.side === 'enemy' ? enemyScale(unit.defId) : 1
    if (!unit.alive || vis.deadAt !== undefined) {
      const since = now - (vis.deadAt ?? now)
      if (unit.side === 'enemy') {
        if (since > 500) return
        ctx.globalAlpha = 1 - since / 500
        this.sprite(ctx, vis.sheet, 'idle', 0, x, this.footY + Math.floor(since / 120), flip, since < 120 ? 'flash' : 'normal', scale)
        ctx.globalAlpha = 1
        return
      }
      // Fallen ally lies on the ground, greyed out, until revived.
      const frame = frameAt(vis.sheet, 'idle', 0).gray
      ctx.save(); ctx.translate(Math.round(x) + 4, this.footY - 11); ctx.rotate(-Math.PI / 2)
      ctx.drawImage(frame, -vis.sheet.anchor[0], -vis.sheet.anchor[1] + 12); ctx.restore()
      return
    }
    const localNow = unit.side === 'enemy' && vis.hitAt !== undefined && now - vis.hitAt < actionTiming.hitStopMs ? vis.hitAt : now
    if (localNow !== now && vis.hitX !== undefined) x = vis.hitX
    const age = vis.anim ? localNow - vis.animAt : -1
    // Cache the approach point before contact so a killed/removed enemy cannot snap the attacker home.
    if (vis.normalMelee && age < (vis.windupMs ?? 0) && vis.targetUid !== undefined) vis.dashTargetX = this.posX(vis.targetUid, alpha) ?? vis.dashTargetX
    const distance = vis.normalMelee && vis.dashTargetX !== undefined ? meleeDashDistance(unit.defId, x, vis.dashTargetX, unit.slot) : undefined
    const pose = actionPose(unit.defId, unit.side, age, vis.windupMs ?? 0, vis.ranged, distance)
    let anim = 'idle', elapsed = localNow + unit.uid * 137
    if (pose.active) { anim = pose.attack ? 'attack' : vis.normalMelee && age < (vis.windupMs ?? 0) && pose.power > 0 ? 'walk' : 'idle'; elapsed = anim === 'walk' ? localNow - vis.animAt : 0 }
    else if ((unit.side === 'ally' && snap.phase === 'walking') || unit.action === 'move') anim = vis.sheet.anims.walk ? 'walk' : 'idle'
    let dx = pose.dx, dy = pose.dy
    if (vis.hitAt !== undefined) dx += hitRecoil(localNow - vis.hitAt, unit.side === 'enemy', vis.critical)
    if (unit.side === 'enemy') {
      const motion = enemyMotion(unit.defId, unit.action, localNow, unit.uid)
      dx += motion.dx; dy += motion.dy
      ctx.fillStyle = '#11121a88'; ctx.fillRect(Math.round(x) - 6, this.footY, 12, 1)
    } else if (!pose.active && anim === 'walk') dy = unit.defId === 'jiangshi' ? -Math.round(Math.abs(Math.sin(localNow / 120 + unit.uid)) * 4) : -(Math.floor(elapsed / (1000 / actionTiming.walkFps)) % 2)
    if (unit.action === 'cast') {
      const job = jobs[unit.defId as JobId]
      ctx.fillStyle = job ? job.color + '55' : '#ffffff55'
      const r = 9 + Math.floor(now / 60) % 3
      ctx.fillRect(Math.round(x) - r, this.footY - 22, r * 2, 22)
    }
    const spawnFade = vis.spawnAt ? Math.min(1, (now - vis.spawnAt) / 160) : 1
    if (unit.effects.includes('kage')) {
      ctx.globalAlpha = 0.3; this.sprite(ctx, vis.sheet, anim, elapsed, x - 7, this.footY + dy, flip)
      ctx.globalAlpha = 0.18; this.sprite(ctx, vis.sheet, anim, elapsed, x - 13, this.footY + dy, flip)
    }
    const blink = unit.effects.includes('mijin') && Math.floor(now / 70) % 2 === 0
    ctx.globalAlpha = spawnFade * (blink ? 0.45 : 1) * (PHANTOMS.has(unit.defId) ? 0.55 : 1)
    this.sprite(ctx, vis.sheet, anim, elapsed, x + dx, this.footY + dy, flip, now < vis.flashUntil ? 'flash' : 'normal', scale, pose)
    vis.drawX = x + dx; vis.drawY = dy
    ctx.globalAlpha = 1
    if (pose.attack && unit.side === 'ally') this.drawActionStroke(ctx, pose.style, x + dx, this.footY + dy, vis.normalMelee ? vis.dashTargetX : undefined)
    const head = this.headY(unit) + dy
    if (unit.effects.includes('iai') && Math.floor(now / 200) % 2 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x) + 7, this.footY - 9, 1, 1) }
    if (unit.effects.includes('obsession')) this.sprite(ctx, sheets.projectiles, 'heart', now, x, head - 1, false)
    if (unit.effects.includes('kakuhen')) {
      const hue = Math.floor(now / 60) % 6, rainbow = ['#ff6fb0', '#ffe27a', '#9df07a', '#9fe4ff', '#6f8fd6', '#c58cff']
      ctx.fillStyle = rainbow[hue]; ctx.fillRect(Math.round(x) - 1, head - 7, 3, 1); ctx.fillRect(Math.round(x), head - 8, 1, 3)
    }
  }

  private drawActionStroke(ctx: CanvasRenderingContext2D, style: string, x: number, foot: number, targetX?: number) {
    const left = Math.round(x), y = Math.round(foot - 16)
    const end = targetX === undefined ? Infinity : Math.floor(targetX) - 1
    const stroke = (offset: number, row: number, width: number, height: number) => {
      const visible = Math.max(0, Math.min(width, end - left - offset + 1))
      if (visible) ctx.fillRect(left + offset, row, visible, height)
    }
    ctx.fillStyle = '#f0dbac'
    if (style === 'thrust') { stroke(15, y, 9, 1); stroke(22, y - 1, 3, 1) }
    else if (style === 'slash') { for (let i = 0; i < 5; i++) stroke(12 + i, y - 5 + i * 2, 2, 1) }
    else if (style === 'palm' || style === 'fist') { stroke(17, y, 4, 2); stroke(19, y - 3, 2, 1) }
    else if (style === 'fan') { stroke(13, y - 3, 4, 1); stroke(15, y, 4, 1) }
    else if (style === 'book') { stroke(8, y - 6, 1, 3); stroke(10, y - 5, 2, 1) }
  }

  /** Normal-attack windups come from the simulation. Boss specials need a core cast before showing a forecast. */
  private drawThreats(ctx: CanvasRenderingContext2D, snap: Snapshot, alpha: number) {
    for (const unit of snap.units) {
      if (unit.side !== 'enemy' || !unit.alive || unit.action !== 'windup') continue
      const x = this.posX(unit.uid, alpha)
      if (x === undefined) continue
      const left = Math.round(x), head = this.headY(unit) - 10
      ctx.fillStyle = '#191320'; ctx.fillRect(left - 2, head - 1, 5, 7)
      ctx.fillStyle = '#ffb16a'; ctx.fillRect(left, head, 1, 3); ctx.fillRect(left, head + 4, 1, 1)
      const targetUid = this.visuals.get(unit.uid)?.targetUid
      const target = targetUid === undefined ? undefined : this.unit(targetUid)
      const targetX = target ? this.posX(target.uid, alpha) : undefined
      if (!target?.alive || targetX === undefined) continue
      const tx = Math.round(targetX)
      ctx.fillStyle = '#ff916d'; ctx.fillRect(tx - 6, this.footY + 1, 13, 1)
      ctx.fillRect(tx - 6, this.footY - 1, 1, 2); ctx.fillRect(tx + 6, this.footY - 1, 1, 2)
    }
  }

  private drawBars(ctx: CanvasRenderingContext2D, unit: SnapshotUnit, alpha: number, now: number, snap: Snapshot) {
    const x = this.visuals.get(unit.uid)?.drawX ?? this.posX(unit.uid, alpha)
    if (x === undefined) return
    const rank = enemyRank(unit, snap), boss = rank === 'boss', elite = rank === 'elite'
    const width = boss ? 30 : elite ? 18 : 14, left = Math.round(x) - Math.floor(width / 2), y = this.headY(unit) - 3 + (this.visuals.get(unit.uid)?.drawY ?? 0)
    const vis = this.visuals.get(unit.uid)
    if (vis?.spawnAt && now - vis.spawnAt < 300) return
    ctx.fillStyle = colors.bar; ctx.fillRect(left - 1, y - 1, width + 2, 3)
    const fill = Math.max(unit.hpRatio > 0 ? 1 : 0, Math.round(width * unit.hpRatio))
    ctx.fillStyle = unit.side === 'enemy' ? elite ? '#ffb357' : boss ? '#e968ac' : colors.enemyHp : unit.hpRatio < 0.3 ? colors.hpLow : colors.hp
    ctx.fillRect(left, y, fill, 1)
    if (boss || elite) {
      ctx.fillStyle = boss ? unit.hpRatio < 0.5 ? '#ff6e54' : '#edb3e0' : '#ffcc76'
      ctx.fillRect(left - 2, y - 1, 1, 3); ctx.fillRect(left + width + 1, y - 1, 1, 3)
      // A crown marks bosses, a diamond marks elites; colour alone is not the distinction.
      if (boss) {
        ctx.fillRect(left - 1, y - 6, 7, 1)
        for (const offset of [0, 3, 6]) ctx.fillRect(left - 1 + offset, y - 8, 1, 2)
      } else { ctx.fillRect(left - 1, y - 6, 1, 3); ctx.fillRect(left - 2, y - 5, 3, 1) }
    }
    if (unit.side === 'ally' && unit.ultOn) {
      const full = unit.ult >= 100
      ctx.fillStyle = full && Math.floor(now / 150) % 2 ? '#ffffff' : colors.ult
      ctx.fillRect(left, y + 1, Math.round(width * Math.min(1, unit.ult / 100)), 1)
    }
    if (unit.defId === 'jirai' && (unit.jonen ?? 0) > 0) {
      ctx.fillStyle = colors.bar; ctx.fillRect(left - 1, y + 2, width + 2, 2)
      ctx.fillStyle = colors.jonen; ctx.fillRect(left, y + 2, Math.round(width * Math.min(1, (unit.jonen ?? 0) / 100)), 1)
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D, now: number) {
    this.fx = this.fx.filter((fx) => now - fx.start < fx.dur)
    for (const fx of this.fx) {
      const t = (now - fx.start) / fx.dur
      if (t < 0) continue
      if (fx.kind === 'impact') {
        ctx.fillStyle = fx.color
        const radius = Math.round(2 + t * fx.radius), x = Math.round(fx.x), y = Math.round(fx.y)
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ctx.fillRect(x + sx * radius, y + sy * radius, t < 0.45 ? 2 : 1, 1)
        if (t < 0.45) { ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5) }
        continue
      }
      if (fx.kind === 'flash') { ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - t)})`; ctx.fillRect(0, this.H - PLAY, this.W, PLAY); continue }
      if (fx.kind === 'slash') {
        ctx.fillStyle = fx.color
        for (let a = -60; a <= 60; a += 12) {
          if ((a + 60) / 120 > t * 1.4) continue
          const rad = a * Math.PI / 180
          ctx.fillRect(Math.round(fx.x + Math.cos(rad) * fx.radius), Math.round(fx.y + Math.sin(rad) * fx.radius), 1, 1)
        }
        continue
      }
      const count = fx.kind === 'smoke' ? 10 : fx.kind === 'boom' ? 16 : 8
      const r = fx.radius * (fx.kind === 'sparkle' ? 1 - t * 0.6 : 0.3 + t * 0.7)
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (fx.kind === 'sparkle' ? now / 200 : 0)
        ctx.fillStyle = fx.kind === 'boom' ? (i % 3 === 0 ? '#ff9b2e' : i % 3 === 1 ? '#e8483e' : '#ffe27a') : fx.color
        ctx.globalAlpha = 1 - t * (fx.kind === 'smoke' ? 0.9 : 0.6)
        const size = fx.kind === 'boom' && t < 0.4 ? 2 : 1
        ctx.fillRect(Math.round(fx.x + Math.cos(angle) * r), Math.round(fx.y + Math.sin(angle) * r * (fx.kind === 'smoke' ? 0.6 : 0.8)), size, size)
      }
      if (fx.kind === 'boom' && t < 0.25) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(fx.x) - 2, Math.round(fx.y) - 2, 5, 5) }
      ctx.globalAlpha = 1
    }
  }

  private drawCoins(ctx: CanvasRenderingContext2D, now: number) {
    const target = { x: this.hud.x + 8, y: this.hud.y + 10 }
    this.coins = this.coins.filter((coin) => now - coin.start < 900)
    for (const coin of this.coins) {
      const t = (now - coin.start) / 1000
      let x: number, y: number
      if (t < 0.45) { x = coin.x + coin.vx * t; y = Math.min(this.footY, coin.y + coin.vy * t + 120 * t * t) }
      else {
        const k = Math.min(1, (t - 0.45) / 0.45), sx = coin.x + coin.vx * 0.45, sy = Math.min(this.footY, coin.y + coin.vy * 0.45 + 120 * 0.2025)
        x = sx + (target.x - sx) * k * k; y = sy + (target.y - sy) * k * k
      }
      this.sprite(ctx, sheets.projectiles, 'koban', now, x, y + 3, false)
    }
  }

  /** Item drops: a chest pops up, flashes its rarity colour and flies into the HUD. */
  private drawLoot(ctx: CanvasRenderingContext2D, now: number) {
    this.loot = this.loot.filter((drop) => now - drop.start < 1400)
    for (const drop of this.loot) {
      const t = (now - drop.start) / 1000
      let x = drop.x, y = drop.y - Math.sin(Math.min(1, t / 0.5) * Math.PI) * 14
      if (t > 0.7) { const k = Math.min(1, (t - 0.7) / 0.7); x += (this.hud.x + 8 - x) * k * k; y += (this.hud.y + 4 - y) * k * k }
      ctx.fillStyle = drop.color
      for (const [ox, oy] of [[-4, -1], [4, -1], [0, -5], [0, 3]]) if (Math.floor(now / 90) % 2) ctx.fillRect(Math.round(x) + ox, Math.round(y) + oy, 1, 1)
      this.sprite(ctx, sheets.projectiles, 'chest', now, x, y + 3, false)
    }
  }

  private drawNumbers(ctx: CanvasRenderingContext2D, now: number) {
    this.numbers = this.numbers.filter((number) => now - number.start < number.dur)
    for (const number of this.numbers) {
      const t = (now - number.start) / number.dur
      const rise = Math.round(t * (number.big ? 9 : 6)), shake = number.big && t < 0.2 ? (Math.floor(now / 40) % 2 ? 1 : -1) : 0
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
      drawText(ctx, number.text, Math.round(number.x - textWidth(number.text) / 2) + shake, number.y - rise - 5, number.color)
      ctx.globalAlpha = 1
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, snap: Snapshot) {
    const label = `B${snap.stageNo}`
    const line1 = `${label}  ${snap.wave}/${balance.waves}`, line2 = String(Math.floor(snap.koban))
    const w = Math.max(textWidth(line1), textWidth(line2) + 8, snap.loop ? textWidth(line1) : 0) + 8, h = 17
    const x = this.W - w - 4, y = this.H - h - 2
    this.hud = { x, y, w, h }
    ctx.fillStyle = colors.hudBg; ctx.fillRect(x, y, w, h)
    ctx.fillStyle = colors.hudLine
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h)
    drawText(ctx, line1, x + 4, y + 3, '#f3ead6', '')
    this.sprite(ctx, sheets.projectiles, 'koban', 0, x + 6, y + 13, false)
    drawText(ctx, line2, x + 12, y + 10, colors.gold, '')
    if (snap.loop) drawText(ctx, 'LOOP', x, y - 7, '#9fe4ff')
  }

  hitTest(dotX: number, dotY: number): HitTarget | null {
    const snap = this.cur
    if (!snap) return null
    if (dotX >= this.hud.x && dotX < this.hud.x + this.hud.w && dotY >= this.hud.y - 8 && dotY < this.hud.y + this.hud.h) return { kind: 'hud' }
    let best: { unit: SnapshotUnit; distance: number } | undefined
    for (const unit of snap.units) {
      if (unit.side === 'enemy' && !unit.alive) continue
      const x = this.visuals.get(unit.uid)?.drawX ?? this.screenX(unit.x, unit.side === 'enemy'), sheet = sheetOf(unit.defId)
      const half = sheet ? Math.ceil(sheet.width * (unit.side === 'enemy' ? enemyScale(unit.defId) : 1) / 3) : 8, top = this.headY(unit) - 4
      if (dotX < x - half || dotX > x + half || dotY < top || dotY > this.footY + 1) continue
      const distance = Math.abs(dotX - x)
      if (!best || distance < best.distance) best = { unit, distance }
    }
    return best ? { kind: 'unit', unit: best.unit } : null
  }
  /** Dot position for DOM overlays (tooltips) anchored above a target. */
  anchorOf(target: HitTarget): { x: number; y: number } {
    if (target.kind === 'hud') return { x: this.hud.x + this.hud.w / 2, y: this.hud.y - 8 }
    const vis = this.visuals.get(target.unit.uid)
    return { x: vis?.drawX ?? this.screenX(target.unit.x, target.unit.side === 'enemy'), y: this.headY(target.unit) - 5 + (vis?.drawY ?? 0) }
  }
  busy(now: number) { return this.fx.length > 0 || this.numbers.length > 0 || this.coins.length > 0 || this.loot.length > 0 || now - this.curAt < 1000 }
}
