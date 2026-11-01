import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SaveImportController, type SaveImportApi } from '../src/renderer/panel/saveImport'
import { MAX_SAVE_IMPORT_BYTES, type SaveImportPreview } from '../src/shared/saveImport'
import { setLocale } from '../src/shared/i18n'

const preview: SaveImportPreview = { token: 'candidate', savedAt: '2026-10-30T00:00:00.000Z', koban: 100,
  currentStage: 4, depthRank: 0, playMs: 60000, party: [{ job: 'samurai', level: 2 }] }
function fixture() {
  const api: SaveImportApi = { prepareSaveImport: vi.fn(async () => preview), confirmSaveImport: vi.fn(async () => {}), cancelSaveImport: vi.fn(async () => {}) }
  const changed = vi.fn(), controller = new SaveImportController(api, changed)
  const file = { name: 'save.json', size: 10, text: vi.fn(async () => '{"a":1}') }
  return { api, changed, controller, file }
}
beforeEach(() => { setLocale('en'); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { setLocale('ja'); vi.restoreAllMocks() })

it('clears profile-specific selections only after a successful import, never on cancellation or failure', async () => {
  const { api, file } = fixture()
  let selection: string | undefined = 'i1'
  const restored = vi.fn(() => { selection = undefined })
  const controller = new SaveImportController(api, vi.fn(), false, restored)
  await controller.selectFile(file); await controller.cancel()
  expect(selection).toBe('i1'); expect(restored).not.toHaveBeenCalled()
  await controller.selectFile(file)
  vi.mocked(api.confirmSaveImport).mockRejectedValueOnce(new Error('quota exceeded'))
  await controller.confirm()
  expect(selection).toBe('i1'); expect(restored).not.toHaveBeenCalled()
  await controller.confirm()
  expect(selection).toBeUndefined(); expect(restored).toHaveBeenCalledOnce()
})

it('previews without restoring, allows cancellation, then requires an explicit confirmation', async () => {
  const { api, controller, file } = fixture()
  await controller.selectFile(file)
  expect(controller.preview).toEqual(preview)
  expect(api.confirmSaveImport).not.toHaveBeenCalled()
  await controller.cancel()
  expect(api.cancelSaveImport).toHaveBeenCalledWith(preview.token)
  expect(controller.preview).toBeUndefined()
  await controller.selectFile(file); await controller.confirm()
  expect(api.confirmSaveImport).toHaveBeenCalledOnce()
  expect(controller.preview).toBeUndefined(); expect(controller.message).toContain('一時停止')
})

it('rejects oversize files before reading them and preserves file read failures', async () => {
  const { api, controller, file } = fixture()
  await controller.selectFile({ ...file, size: MAX_SAVE_IMPORT_BYTES + 1 })
  expect(file.text).not.toHaveBeenCalled(); expect(api.prepareSaveImport).not.toHaveBeenCalled()
  expect(controller.error).toContain('exceeds the size limit')
  file.text.mockRejectedValueOnce(new Error('disk read failed'))
  await controller.selectFile(file)
  expect(controller.error).toContain('disk read failed'); expect(controller.preview).toBeUndefined()
  await controller.selectFile(file)
  expect(controller.preview).toEqual(preview); expect(controller.error).toBe('')
})

it('blocks overlapping selections and confirmations while preserving the confirmed token', async () => {
  const { api, controller, file } = fixture()
  let resolveRead!: (text: string) => void
  file.text.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve }))
  const pending = controller.selectFile(file)
  expect(controller.busy).toBe(true)
  await controller.selectFile(file); await controller.confirm()
  expect(file.text).toHaveBeenCalledOnce(); expect(api.confirmSaveImport).not.toHaveBeenCalled()
  resolveRead('save contents'); await pending
  let resolveCommit!: () => void
  vi.mocked(api.confirmSaveImport).mockImplementationOnce(() => new Promise(resolve => { resolveCommit = resolve }))
  const confirmed = controller.confirm()
  await controller.confirm(); await controller.cancel()
  expect(api.confirmSaveImport).toHaveBeenCalledOnce(); expect(api.cancelSaveImport).not.toHaveBeenCalled()
  resolveCommit(); await confirmed; expect(controller.busy).toBe(false)
})

it('retains the confirmation and failure cause when committing fails, without reporting success', async () => {
  const { api, controller, file } = fixture()
  await controller.selectFile(file)
  vi.mocked(api.confirmSaveImport).mockRejectedValueOnce(new Error('quota exceeded'))
  await controller.confirm()
  expect(controller.error).toContain('quota exceeded'); expect(controller.preview).toEqual(preview)
  expect(controller.message).toBe(''); expect(controller.busy).toBe(false)
  await controller.cancel(); expect(controller.preview).toBeUndefined()
})
