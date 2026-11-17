import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PACKAGE_FILES, verifyInventory, verifyNotices } from '../scripts/verify-package.mjs'

test('release inventory rejects omitted notices and accidentally shipped local files', () => {
  const files = PACKAGE_FILES.map((path) => ({ path }))
  verifyInventory(files)
  assert.throws(() => verifyInventory(files.filter((file) => file.path !== 'THIRD-PARTY-NOTICES.txt')))
  assert.throws(() => verifyInventory([...files, { path: '.env' }]))
})

test('release notices reject missing copyright or truncated third-party terms', async () => {
  const upstream = await readFile(new URL('../node_modules/pele/LICENSE', import.meta.url), 'utf8')
  const notices = await readFile(new URL('../THIRD-PARTY-NOTICES.txt', import.meta.url), 'utf8')
  verifyNotices(notices, upstream)
  assert.throws(() => verifyNotices(notices.replace('Copyright (c) 2026 kepano', ''), upstream))
  assert.throws(() => verifyNotices(notices.slice(0, notices.indexOf('The reset icon')), upstream))
})
