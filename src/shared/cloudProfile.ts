import { addOffline, computeOffline, validateProfile } from '../core/progress/profile.ts'

/** A cloud backup remains client-originated progress, never trusted market inventory. */
export function prepareCloudRestore(raw: unknown, now = Date.now()) {
  const profile = validateProfile(structuredClone(raw))
  const savedAt = Date.parse(profile.savedAt)
  if (!Number.isFinite(savedAt)) throw new Error('Invalid cloud save timestamp')
  if (!profile.progress.inTown) {
    const reward = computeOffline(profile, Math.max(0, now - savedAt))
    if (reward) addOffline(profile, reward)
  }
  return profile
}
