import type { Frame } from '../../shared/api'

/** Keep only the newest snapshot while hidden; historical effects must not replay on return. */
export class VisibleFrames {
  private visible = true
  private pending?: Frame
  private fresh = false
  setVisible(visible: boolean): { frame: Frame; fresh: boolean } | undefined {
    if (this.visible === visible) return
    this.visible = visible
    if (!visible) { this.fresh = true; return }
    if (!this.pending) return
    const frame = this.pending; this.pending = undefined
    return this.accept(frame)
  }
  accept(frame: Frame): { frame: Frame; fresh: boolean } | undefined {
    if (!this.visible) { this.pending = { snapshot: frame.snapshot, events: [] }; return }
    const fresh = this.fresh; this.fresh = false
    return { frame: fresh ? { snapshot: frame.snapshot, events: [] } : frame, fresh }
  }
  get shown() { return this.visible && !this.fresh }
}
