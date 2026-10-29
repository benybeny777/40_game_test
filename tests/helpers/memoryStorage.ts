/** A bounded test double for browser persistence, shared by normal-load and recovery tests. */
export class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  failWrites = false
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error('QuotaExceededError'); this.values.set(key, String(value)) }
}
