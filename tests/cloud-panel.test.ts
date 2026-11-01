import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCloudSettings, type CloudSettingsApi } from '../src/renderer/panel/cloud'
import type { CloudResult, CloudView } from '../src/shared/cloud'
import { setLocale } from '../src/shared/i18n'
import { CloudClient } from '../src/shared/cloudClient'

class Element {
  children: Array<Element | string> = []
  attributes: Record<string, string> = {}
  listeners = new Map<string, (event: Event) => void>()
  className = ''; value = ''; disabled = false
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attributes[name] = value; if (name === 'value') this.value = value; if (name === 'disabled') this.disabled = true }
  append(...children: Array<Element | string>) { this.children.push(...children) }
  replaceChildren(...children: Array<Element | string>) { this.children = children }
  addEventListener(name: string, listener: (event: Event) => void) { this.listeners.set(name, listener) }
  fire(name: string) { this.listeners.get(name)?.({ target: this, preventDefault: () => {} } as unknown as Event) }
}
const text = (node: Element): string => node.children.map(child => typeof child === 'string' ? child : text(child)).join(' ')
const all = (node: Element): Element[] => [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : all(child))]
const keyed = (root: Element, key: string) => all(root).find(node => node.attributes['data-focus-key'] === `cloud-${key}`)!
const view = (extra: Partial<CloudView> = {}): CloudView => ({ configured: true, endpoint: 'http://127.0.0.1:8787', account: null, revision: null, updatedAt: null, error: null, ...extra })
const setup = (initial: CloudView) => {
  const api: CloudSettingsApi = { getCloud: vi.fn(async () => initial), cloudCommand: vi.fn(async () => ({ ok: true, view: initial })) }
  const render = createCloudSettings(api), root = render() as unknown as Element
  return { api, render, root }
}
beforeEach(() => { vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag) }); setLocale('en') })
afterEach(() => { vi.unstubAllGlobals(); setLocale('ja') })

describe('cloud settings UI', () => {
  it('invalidates profile selections only after successful confirmed download', async () => {
    const initial = view({ account: { id: 'a1', username: 'test_user' }, revision: 7 })
    const api: CloudSettingsApi = { getCloud: vi.fn(async () => initial), cloudCommand: vi.fn(async () => ({ ok: false, message: 'download rejected', view: initial })) }
    const profileReplaced = vi.fn(), replacing = vi.fn()
    const root = createCloudSettings(api, { profileReplaced, replacing })() as unknown as Element
    await vi.waitFor(() => expect(keyed(root, 'download')).toBeTruthy())
    keyed(root, 'download').fire('click'); keyed(root, 'cancel-download').fire('click')
    expect(replacing).not.toHaveBeenCalled(); expect(profileReplaced).not.toHaveBeenCalled()
    keyed(root, 'download').fire('click'); keyed(root, 'confirm-download').fire('click')
    await vi.waitFor(() => expect(text(root)).toContain('download rejected'))
    expect(replacing.mock.calls).toEqual([[true], [false]])
    expect(profileReplaced).not.toHaveBeenCalled()
    vi.mocked(api.cloudCommand).mockResolvedValueOnce({ ok: true, view: initial })
    keyed(root, 'download').fire('click'); keyed(root, 'confirm-download').fire('click')
    await vi.waitFor(() => expect(profileReplaced).toHaveBeenCalledOnce())
    expect(replacing).toHaveBeenLastCalledWith(false)
  })
  it('translates real connection and nested HTTP errors and keeps unknown server details intact', async () => {
    const cases: Array<{ fetcher: typeof fetch; expected: string; unknown?: boolean }> = [
      { fetcher: vi.fn(async () => { throw new Error('connection refused') }), expected: 'Could not connect to the cloud' },
      { fetcher: vi.fn(async () => new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } }), { status: 429 })), expected: 'Too many requests' },
      { fetcher: vi.fn(async () => new Response('', { status: 503 })), expected: 'HTTP 503: Could not read the response body' },
      { fetcher: vi.fn(async () => new Response(JSON.stringify({ error: { code: 'VENDOR_NEW_ERROR', message: 'Vendor detail: 保守中 UNKNOWN_42' } }), { status: 502 })), expected: 'Vendor detail: 保守中 UNKNOWN_42', unknown: true },
    ]
    for (const item of cases) {
      const client = new CloudClient('http://127.0.0.1:8787', { readProfile: () => ({}), restoreProfile: () => {} }, item.fetcher)
      const result = await client.execute({ action: 'login', username: 'test_user', password: 'valid_password_123' })
      const { root } = setup(result.view)
      await vi.waitFor(() => expect(text(root)).toContain(item.expected))
      if (!item.unknown) expect(text(root)).not.toMatch(/[一-龯ぁ-ゖァ-ヺ]/u)
    }
  })
  it('shows disconnected service honestly and offers no pretend account controls', async () => {
    const { root, api } = setup(view({ configured: false, endpoint: null }))
    await vi.waitFor(() => expect(text(root)).toContain('No cloud server is connected'))
    expect(all(root).some(node => node.tag === 'input')).toBe(false)
    expect(api.cloudCommand).not.toHaveBeenCalled()
    expect(text(root)).not.toMatch(/[一-龯ぁ-ゖァ-ヺ]/u)
  })
  it('translates an uncertain upload warning together with the unknown cloud status', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'test-token', account: { id: 'a1', username: 'test_user' }, expiresAt: '2026-11-10T00:00:00Z' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: 0, updatedAt: null, save: null })))
      .mockRejectedValueOnce(new Error('response lost'))
    const client = new CloudClient('http://127.0.0.1:8787', { readProfile: () => ({}), restoreProfile: () => {} }, fetcher)
    expect((await client.execute({ action: 'login', username: 'test_user', password: 'valid_password_123' })).ok).toBe(true)
    const result = await client.execute({ action: 'upload', revision: 0 })
    const { root } = setup(result.view)
    await vi.waitFor(() => expect(text(root)).toContain('The save result is unknown'))
    expect(text(root)).toContain('cloud status is unknown')
    expect(text(root)).toContain('Could not connect to the cloud')
    expect(text(root)).not.toMatch(/[一-龯ぁ-ゖァ-ヺ]/u)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('clears the password on submit, blocks duplicate submissions and visibly reports uncertain results', async () => {
    const { root, api } = setup(view())
    await vi.waitFor(() => expect(keyed(root, 'password')).toBeTruthy())
    const username = keyed(root, 'username'), password = keyed(root, 'password')
    username.value = 'test_user'; username.fire('input'); password.value = 'secret_password_123'
    const form = all(root).find(node => node.tag === 'form')!
    let reject!: (error: Error) => void
    vi.mocked(api.cloudCommand).mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    form.fire('submit'); form.fire('submit')
    expect(password.value).toBe('')
    expect(api.cloudCommand).toHaveBeenCalledTimes(1)
    expect(api.cloudCommand).toHaveBeenCalledWith({ action: 'login', username: 'test_user', password: 'secret_password_123' })
    expect(all(root).filter(node => node.tag === 'button').every(node => node.disabled)).toBe(true)
    reject(new Error('connection lost'))
    await vi.waitFor(() => expect(text(root)).toContain('The result could not be confirmed'))
    expect(keyed(root, 'password').value).toBe('')
    expect(all(root).some(node => node.attributes.role === 'alert')).toBe(true)
    expect(api.cloudCommand).toHaveBeenCalledTimes(1)
    expect(text(root)).not.toContain('secret_password_123')
    errors.mockRestore()
  })
  it('requires confirmation tied to the displayed cloud revision before overwriting local progress', async () => {
    const initial = view({ account: { id: 'a1', username: 'test_user' }, revision: 7, updatedAt: '2026-10-29T00:00:00Z' })
    const { root, api } = setup(initial)
    await vi.waitFor(() => expect(keyed(root, 'download')).toBeTruthy())
    keyed(root, 'download').fire('click')
    expect(api.cloudCommand).not.toHaveBeenCalled()
    expect(text(root)).toContain('replaces your current local progress')
    keyed(root, 'cancel-download').fire('click')
    expect(keyed(root, 'confirm-download')).toBeUndefined()
    keyed(root, 'download').fire('click'); keyed(root, 'confirm-download').fire('click')
    await vi.waitFor(() => expect(api.cloudCommand).toHaveBeenCalledWith({ action: 'download', revision: 7 }))
  })
  it('validates account input and sends registration only when explicitly selected', async () => {
    const { root, api } = setup(view())
    await vi.waitFor(() => expect(keyed(root, 'mode')).toBeTruthy())
    keyed(root, 'username').value = 'Bad Name'; keyed(root, 'username').fire('input')
    keyed(root, 'password').value = 'short'
    all(root).find(node => node.tag === 'form')!.fire('submit')
    expect(api.cloudCommand).not.toHaveBeenCalled()
    expect(text(root)).toContain('lowercase letters')
    keyed(root, 'mode').value = 'register'; keyed(root, 'mode').fire('change')
    keyed(root, 'username').value = 'new_user'; keyed(root, 'username').fire('input')
    keyed(root, 'password').value = 'valid_password_123'
    all(root).find(node => node.tag === 'form')!.fire('submit')
    expect(api.cloudCommand).toHaveBeenCalledExactlyOnceWith({ action: 'register', username: 'new_user', password: 'valid_password_123' })
    await vi.waitFor(() => expect(keyed(root, 'password')?.value).toBe(''))
  })
  it('disables download when no remote save exists and does not automatically retry an uncertain upload', async () => {
    const { root, api } = setup(view({ account: { id: 'a1', username: 'test_user' }, revision: 0 }))
    await vi.waitFor(() => expect(keyed(root, 'download')).toBeTruthy())
    expect(keyed(root, 'download').disabled).toBe(true)
    vi.mocked(api.cloudCommand).mockResolvedValue({ ok: false, view: view({ account: { id: 'a1', username: 'test_user' }, revision: 0 }), message: 'Upload result unknown' } satisfies CloudResult)
    keyed(root, 'upload').fire('click')
    await vi.waitFor(() => expect(text(root)).toContain('Upload result unknown'))
    expect(api.cloudCommand).toHaveBeenCalledTimes(1)
    expect(api.cloudCommand).toHaveBeenCalledWith({ action: 'upload', revision: 0 })
  })
  it('distinguishes unknown metadata from no save and requires refresh before upload', async () => {
    const unknown = view({ account: { id: 'a1', username: 'test_user' }, revision: null })
    const { root, api } = setup(unknown)
    await vi.waitFor(() => expect(keyed(root, 'upload')).toBeTruthy())
    expect(text(root)).toContain('cloud status is unknown')
    expect(text(root)).not.toContain('There is no cloud save yet')
    expect(keyed(root, 'upload').disabled).toBe(true)
    expect(keyed(root, 'download').disabled).toBe(true)
    keyed(root, 'upload').fire('click')
    expect(api.cloudCommand).not.toHaveBeenCalled()
    vi.mocked(api.cloudCommand).mockResolvedValue({ ok: true, view: { ...unknown, revision: 0 } })
    keyed(root, 'refresh').fire('click')
    await vi.waitFor(() => expect(text(root)).toContain('Cloud status updated'))
    expect(keyed(root, 'upload').disabled).toBe(false)
    vi.mocked(api.cloudCommand).mockResolvedValue({ ok: true, view: { ...unknown, revision: 1 } })
    keyed(root, 'upload').fire('click')
    await vi.waitFor(() => expect(text(root)).toContain('Saved to the cloud'))
  })
  it('rereads only cached metadata on panel rebuild and preserves the existing password field when nothing changed', async () => {
    const { root, api, render } = setup(view())
    await vi.waitFor(() => expect(keyed(root, 'password')).toBeTruthy())
    const input = keyed(root, 'password'); input.value = 'unsent_password_123'
    expect(render()).toBe(root)
    await vi.waitFor(() => expect(api.getCloud).toHaveBeenCalledTimes(2))
    expect(keyed(root, 'password')).toBe(input)
    expect(input.value).toBe('unsent_password_123')
    expect(api.cloudCommand).not.toHaveBeenCalled()
  })
})
