import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloudClient } from '../src/shared/cloudClient'

const endpoint = 'http://127.0.0.1:8787'
const at = '2030-01-01T00:00:00.000Z'
const auth = { token: 'private-bearer', account: { id: 'account-a', username: 'alice' }, expiresAt: at }
const empty = { revision: 0, save: null, updatedAt: null }
const remote = (revision: number, profile: unknown = { version: 3 }) => ({ revision, updatedAt: at, save: { format: 1, game: 'taskbar-hyakkiko', profile } })
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
function setup() {
  const fetcher = vi.fn<typeof fetch>()
  const readProfile = vi.fn(() => ({ version: 3, marker: 'local' })), restoreProfile = vi.fn<(_profile: unknown) => void>()
  const client = new CloudClient(endpoint, { readProfile, restoreProfile }, fetcher)
  const login = async (save = empty) => {
    fetcher.mockResolvedValueOnce(response(auth)).mockResolvedValueOnce(response(save))
    expect((await client.execute({ action: 'login', username: 'alice', password: 'private-password' })).ok).toBe(true)
  }
  return { client, fetcher, readProfile, restoreProfile, login }
}
afterEach(() => { vi.useRealTimers() })

describe('explicit cloud save client', () => {
  it.each([undefined, '', 'http://example.com', 'https://example.com/path', 'https://user:password@example.com', 'https://@example.com', 'https://example.com/?x=1', 'https://example.com/#fragment', 'https://example.com/?', 'https://example.com/#'])('does not connect to an unset or unsafe endpoint %s', async endpoint => {
    const fetcher = vi.fn<typeof fetch>(), client = new CloudClient(endpoint, { readProfile: () => ({}), restoreProfile: () => {} }, fetcher)
    expect(client.view().configured).toBe(false)
    expect((await client.execute({ action: 'refresh' })).ok).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['https://cloud.example.com', 'http://localhost:8787', 'http://[::1]:8787'])('accepts HTTPS or loopback origins %s', endpoint => {
    expect(new CloudClient(endpoint, { readProfile: () => ({}), restoreProfile: () => {} }).view().configured).toBe(true)
  })
  it('registers, reads metadata, isolates client sessions and never exposes credentials', async () => {
    const { client, fetcher } = setup()
    fetcher.mockResolvedValueOnce(response(auth, 201)).mockResolvedValueOnce(response(empty))
    const result = await client.execute({ action: 'register', username: 'alice', password: 'private-password' })
    expect(result.ok).toBe(true); expect(result.view.revision).toBe(0)
    expect(fetcher.mock.calls[0][0]).toBe(`${endpoint}/v1/accounts`)
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer private-bearer' })
    expect(fetcher.mock.calls[1][1]?.redirect).toBe('error')
    expect(JSON.stringify(result)).not.toMatch(/private-password|private-bearer/)
    const copy = client.view(); copy.account!.username = 'mutated'
    expect(client.view().account?.username).toBe('alice')
    const second = new CloudClient(endpoint, { readProfile: () => ({}), restoreProfile: () => {} }, fetcher)
    expect((await second.execute({ action: 'refresh' })).ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('uploads only a selected known revision and advances it using CAS', async () => {
    const { client, fetcher, login } = setup(); await login()
    expect((await client.execute({ action: 'upload' })).ok).toBe(false)
    expect((await client.execute({ action: 'upload', revision: 2 })).ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockResolvedValueOnce(response(remote(1)))
    expect((await client.execute({ action: 'upload', revision: 0 })).ok).toBe(true)
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ baseRevision: 0, save: { format: 1, game: 'taskbar-hyakkiko', profile: { version: 3, marker: 'local' } } })
    expect((await client.execute({ action: 'upload', revision: 0 })).ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('reports a conflict without retrying or restoring another revision', async () => {
    const { client, fetcher, login, restoreProfile } = setup(); await login()
    fetcher.mockResolvedValueOnce(response({ error: { code: 'REVISION_CONFLICT', message: 'Remote save changed' }, revision: 2, updatedAt: at }, 409))
    const result = await client.execute({ action: 'upload', revision: 0 })
    expect(result.ok).toBe(false); expect(result.view.revision).toBeNull()
    expect(result.view.error).toContain('Remote save changed')
    expect((await client.execute({ action: 'upload', revision: 2 })).ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3); expect(restoreProfile).not.toHaveBeenCalled()
  })
  it('requires refresh after an unknown write and never retries it automatically', async () => {
    const { client, fetcher, login } = setup(); await login()
    fetcher.mockRejectedValueOnce(new TypeError('connection dropped'))
    const result = await client.execute({ action: 'upload', revision: 0 })
    expect(result.ok).toBe(false); expect(result.view.revision).toBeNull()
    expect(result.view.error).toContain('保存結果が不明')
    expect((await client.execute({ action: 'upload', revision: 0 })).ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3)
    fetcher.mockResolvedValueOnce(response(remote(1)))
    expect((await client.execute({ action: 'refresh' })).view.revision).toBe(1)
  })
  it('rejects an expired session and removes its memory token', async () => {
    const { client, fetcher, login } = setup(); await login()
    fetcher.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
    const result = await client.execute({ action: 'refresh' })
    expect(result.ok).toBe(false); expect(result.view.account).toBeNull()
    expect((await client.execute({ action: 'refresh' })).ok).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('retains login when metadata lookup fails so refresh can recover explicitly', async () => {
    const { client, fetcher } = setup()
    fetcher.mockResolvedValueOnce(response(auth)).mockRejectedValueOnce(new Error('offline'))
    const result = await client.execute({ action: 'login', username: 'alice', password: 'private-password' })
    expect(result.ok).toBe(false); expect(result.view.account?.id).toBe('account-a'); expect(result.view.revision).toBeNull()
    fetcher.mockResolvedValueOnce(response(empty))
    expect((await client.execute({ action: 'refresh' })).ok).toBe(true)
  })
  it('keeps the session after logout failure and clears it only after server confirmation', async () => {
    const { client, fetcher, login } = setup(); await login()
    fetcher.mockRejectedValueOnce(new Error('offline'))
    expect((await client.execute({ action: 'logout' })).view.account?.id).toBe('account-a')
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const result = await client.execute({ action: 'logout' })
    expect(result.ok).toBe(true); expect(result.view.account).toBeNull()
    expect(fetcher.mock.calls[3][1]?.headers).toEqual({ Authorization: 'Bearer private-bearer' })
  })
  it('allows a new login after the server confirms logout session is expired', async () => {
    const { client, fetcher, login } = setup(); await login()
    fetcher.mockResolvedValueOnce(response({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }, 401))
    const result = await client.execute({ action: 'logout' })
    expect(result.ok).toBe(true)
    expect(result.view.account).toBeNull()
    expect(result.view.revision).toBeNull()
    expect(result.view.error).toBeNull()
    await login()
    expect(fetcher.mock.calls[3][1]?.headers).toEqual({ 'Content-Type': 'application/json' })
  })
  it('rechecks the selected download revision and refuses absent or changed saves', async () => {
    const { client, fetcher, login, restoreProfile } = setup(); await login()
    fetcher.mockResolvedValueOnce(response(empty))
    expect((await client.execute({ action: 'download', revision: 0 })).ok).toBe(false)
    fetcher.mockResolvedValueOnce(response(remote(1)))
    expect((await client.execute({ action: 'download', revision: 0 })).ok).toBe(false)
    expect(client.view().revision).toBe(1); expect(restoreProfile).not.toHaveBeenCalled()
  })
  it('restores through validation and reports future or malformed profiles as a failed restore', async () => {
    const { client, fetcher, login, restoreProfile } = setup(); await login()
    fetcher.mockResolvedValueOnce(response(remote(1)))
    await client.execute({ action: 'refresh' })
    const future = { version: 999, marker: 'future' }
    fetcher.mockResolvedValueOnce(response(remote(1, future)))
    restoreProfile.mockImplementationOnce(() => { throw new Error('unsupported save version') })
    const result = await client.execute({ action: 'download', revision: 1 })
    expect(result.ok).toBe(false); expect(result.view.error).toContain('unsupported save version')
    expect(restoreProfile).toHaveBeenCalledExactlyOnceWith(future)
    fetcher.mockResolvedValueOnce(response(remote(1)))
    expect((await client.execute({ action: 'download', revision: 1 })).ok).toBe(true)
  })
  it('times out in ten seconds and excludes concurrent commands', async () => {
    vi.useFakeTimers()
    const { client, fetcher } = setup()
    fetcher.mockImplementationOnce(() => new Promise<Response>(() => {}))
    const pending = client.execute({ action: 'login', username: 'alice', password: 'private-password' })
    expect((await client.execute({ action: 'refresh' })).view.error).toContain('処理中')
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10000)
    const result = await pending
    expect(result.ok).toBe(false); expect(result.view.error).toContain('タイムアウト')
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })
})
