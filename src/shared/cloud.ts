export const DEVELOPMENT_CLOUD_ENDPOINT = 'http://127.0.0.1:8787'
export interface CloudAccount { id: string; username: string }
export interface CloudView {
  configured: boolean
  endpoint: string | null
  account: CloudAccount | null
  revision: number | null
  updatedAt: string | null
  error: string | null
}
export type CloudCommand =
  | { action: 'register' | 'login'; username: string; password: string }
  | { action: 'refresh' | 'upload' | 'download' | 'logout'; revision?: number }
export interface CloudResult { ok: boolean; view: CloudView; message?: string }
export function parseCloudCommand(input: unknown): CloudCommand {
  if (!input || typeof input !== 'object' || !('action' in input)) throw new Error('Invalid cloud command')
  const raw = input as Record<string, unknown>
  if (raw.action === 'register' || raw.action === 'login') {
    if (typeof raw.username !== 'string' || !/^[a-z0-9_]{3,32}$/.test(raw.username) || typeof raw.password !== 'string' || raw.password.length < 12 || raw.password.length > 256) throw new Error('Invalid account credentials')
    return { action: raw.action, username: raw.username, password: raw.password }
  }
  if (!['refresh', 'upload', 'download', 'logout'].includes(String(raw.action))) throw new Error('Invalid cloud action')
  if ((raw.action === 'upload' || raw.action === 'download') && (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0)) throw new Error('Cloud revision required')
  return { action: raw.action as 'refresh' | 'upload' | 'download' | 'logout', ...(raw.revision === undefined ? {} : { revision: raw.revision as number }) }
}
