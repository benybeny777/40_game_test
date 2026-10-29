import type { AudioSessionView } from './audioSession'
import { onLocaleChange, registerTranslations, translatedLabel as tr } from '../shared/i18n'
import './audioNotice.css'

registerTranslations({
  '通知音を再生できませんでした。設定で通知音をOFF→ONにすると再試行します。': 'Notification audio failed. Turn notification sounds off and on in Settings to retry.',
})

/** Persistent, independent notice: simulation banners and save messages cannot overwrite it. */
export function createAudioNotice() {
  const notice = document.createElement('aside')
  notice.className = 'audio-error'; notice.setAttribute('role', 'alert'); notice.hidden = true
  document.body.append(notice)
  let error: unknown | null = null
  const draw = () => {
    notice.hidden = error === null
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    notice.textContent = error === null ? '' : `${tr('通知音を再生できませんでした。設定で通知音をOFF→ONにすると再試行します。')}\n${detail}`
  }
  onLocaleChange(draw)
  return (view: AudioSessionView) => { error = view.error; draw() }
}
