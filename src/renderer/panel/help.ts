import fontLicense from '../../../assets/fonts/OFL.txt?raw'
import { getLocale } from '../../shared/i18n'
import { getHelpContent, type HelpBlock } from './helpContent'
import './translations'
import { textElement as node } from './dom'

function paragraph(text: string) { return node('p', 'help-text', text) }
function blockView(block: HelpBlock): HTMLElement {
  if (block.kind === 'paragraph') return paragraph(block.text)
  if (block.kind === 'list') {
    const list = node('ul', 'help-list')
    list.append(...block.items.map(text => node('li', '', text)))
    return list
  }
  if (block.kind === 'attributes') {
    const attributes = node('dl', 'help-attributes')
    for (const entry of block.rows) {
      const row = node('div', 'help-attribute-row')
      row.append(node('dt', '', entry.term), node('dd', '', entry.description)); attributes.append(row)
    }
    return attributes
  }
  const cards = node('div', block.className)
  for (const entry of block.cards) {
    const card = node('article', entry.className)
    const titleClass = entry.className.startsWith('help-role') ? 'help-role-title' : entry.className === 'help-difficulty' ? 'help-difficulty-title' : 'help-platform-title'
    card.append(node('h4', titleClass, entry.title), ...entry.blocks.map(blockView)); cards.append(card)
  }
  return cards
}

export function renderHelp(): HTMLElement {
  const copy = getHelpContent(), root = node('section', 'help-root')
  const intro = node('div', 'help-intro')
  intro.append(node('span', 'help-eyebrow', copy.eyebrow), node('h2', 'help-title', copy.title), paragraph(copy.intro)); root.append(intro)
  const start = node('section', 'help-start'), steps = node('ol', 'help-steps')
  for (const entry of copy.steps) {
    const step = node('li', 'help-step')
    step.append(node('b', 'help-step-title', entry.title), paragraph(entry.body)); steps.append(step)
  }
  start.append(node('h3', 'help-subtitle', copy.startTitle), steps); root.append(start)
  for (const entry of copy.sections) {
    const section = node('details', 'help-section'), summary = node('summary', 'help-section-title', entry.title)
    summary.dataset.focusKey = `help-${entry.id}`
    const body = node('div', 'help-section-body'); body.append(...entry.blocks.map(blockView))
    section.append(summary, body); root.append(section)
  }
  const license = node('details', 'help-section')
  license.append(node('summary', 'help-section-title', getLocale() === 'en' ? 'Font license — BIZ UDPGothic' : 'フォントライセンス — BIZ UDPGothic'), node('pre', 'font-license', fontLicense))
  root.append(license)
  return root
}
