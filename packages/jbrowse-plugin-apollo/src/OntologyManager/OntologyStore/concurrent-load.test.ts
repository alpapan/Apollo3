import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals'

import OntologyStore from '.'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

jest.setTimeout(120_000)

const localPath = path.resolve(
  __dirname,
  '../../../test_data/goslim_generic.json',
)

function newStore() {
  return new OntologyStore(
    'Gene Ontology',
    'concurrent load test',
    { locationType: 'LocalPathLocation', localPath },
    {},
  )
}

// fake-indexeddb is the external boundary here: count how many times a load
// empties the nodes store, which is the first thing every load does.
const nodesClears: string[] = []
const openDbs: { close(): void }[] = []
// eslint-disable-next-line @typescript-eslint/unbound-method
const originalClear = IDBObjectStore.prototype.clear

beforeEach(() => {
  nodesClears.length = 0
  IDBObjectStore.prototype.clear = function clear(this: IDBObjectStore) {
    if (this.name === 'nodes') {
      nodesClears.push(this.transaction.db.name)
    }
    return originalClear.call(this)
  }
})

afterEach(async () => {
  IDBObjectStore.prototype.clear = originalClear
  for (const db of openDbs.splice(0)) {
    db.close()
  }
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(
      'Apollo Ontology "Gene Ontology" "concurrent load test"',
    )
    request.addEventListener('success', () => {
      resolve()
    })
    request.addEventListener('error', () => {
      resolve()
    })
  })
})

describe('OntologyStore loading one database from several stores', () => {
  it('loads the ontology once when two stores of the same database start together', async () => {
    const first = newStore()
    const second = newStore()
    openDbs.push(...(await Promise.all([first.db, second.db])))

    expect(nodesClears).toHaveLength(1)
    expect(await first.termCount()).toBeGreaterThan(0)
    expect(await second.termCount()).toBe(await first.termCount())
  })

  it('does not load again when a later store finds the database complete', async () => {
    openDbs.push(await newStore().db, await newStore().db)

    expect(nodesClears).toHaveLength(1)
  })
})
