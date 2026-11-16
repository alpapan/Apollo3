/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { openLocation } from '@jbrowse/core/util/io'
import {
  type IDBPDatabase,
  type IDBPTransaction,
  openDB,
} from 'idb/with-async-ittr'

import { PREFIXED_ID_PATH, getWords } from './fulltext'
import {
  type OntologyDB,
  isOntologyDBEdge,
  isOntologyDBNode,
} from './indexeddb-schema'
import type { GraphDocument } from './obo-graph-json-schema'
import { defaultTextIndexFields } from './types'

import type OntologyStore from '.'

/** schema version we are currently on, used for the IndexedDB schema open call */
const schemaVersion = 2

export type Database = IDBPDatabase<OntologyDB>

/** open the IndexedDB and create the DB schema if necessary */
export async function openDatabase(this: OntologyStore, dbName: string) {
  // await deleteDB(dbName) // uncomment this to reload every time during development
  return openDB<OntologyDB>(dbName, schemaVersion, {
    upgrade(
      database: IDBPDatabase<OntologyDB>,
      oldVersion: number,
      newVersion: number | null,
      transaction: IDBPTransaction<
        OntologyDB,
        ArrayLike<'nodes' | 'edges' | 'meta'>,
        'versionchange'
      >,
      _event: IDBVersionChangeEvent,
    ): void {
      if (oldVersion < schemaVersion) {
        if (database.objectStoreNames.contains('meta')) {
          database.deleteObjectStore('meta')
        }
        if (database.objectStoreNames.contains('nodes')) {
          database.deleteObjectStore('nodes')
        }
        if (database.objectStoreNames.contains('edges')) {
          database.deleteObjectStore('edges')
        }
      }
      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta')
      }
      if (!database.objectStoreNames.contains('nodes')) {
        database.createObjectStore('nodes', { keyPath: 'id' })
        const nodes = transaction.objectStore('nodes')
        nodes.createIndex('by-label', 'lbl')
        nodes.createIndex('by-type', 'type')
        nodes.createIndex('by-synonym', ['meta', 'synonyms', 'val'])
        nodes.createIndex('full-text-words', 'fullTextWords', {
          multiEntry: true,
        })
      }
      if (!database.objectStoreNames.contains('edges')) {
        database.createObjectStore('edges', { autoIncrement: true })
        const edges = transaction.objectStore('edges')
        edges.createIndex('by-subject', 'sub')
        edges.createIndex('by-object', 'obj')
        edges.createIndex('by-predicate', 'pred')
      }
    },
  })
}

/** serialize all our words in the DB node so they can be indexed */
function serializeWords(foundWords: Iterable<[string, string]>): string[] {
  const allWords = new Set<string>()
  for (const [, word] of foundWords) {
    allWords.add(word)
  }
  return [...allWords]
}

/** load a OBO Graph JSON file into a database */
export async function loadOboGraphJson(this: OntologyStore, db: Database) {
  const startTime = Date.now()

  let percentProgress = 1
  this.options.update?.('Parsing JSON', percentProgress)
  // TODO: using file streaming along with an event-based json parser
  // instead of JSON.parse and .readFile could probably make this faster
  // and less memory intensive
  let oboGraph: GraphDocument
  try {
    oboGraph = JSON.parse(
      await openLocation(this.sourceLocation).readFile('utf8'),
    ) as GraphDocument
  } catch {
    throw new Error('Error in loading ontology')
  }

  percentProgress += 5
  this.options.update?.('Parsing JSON complete', percentProgress)

  const parseTime = Date.now()

  const [graph, ...additionalGraphs] = oboGraph.graphs ?? []
  if (!graph) {
    return
  }
  if (additionalGraphs.length > 0) {
    throw new Error('multiple graphs not supported')
  }

  try {
    const tx = db.transaction(['meta', 'nodes', 'edges'], 'readwrite')
    await tx.objectStore('meta').clear()
    await tx.objectStore('nodes').clear()
    await tx.objectStore('edges').clear()

    // load nodes
    const nodeStore = tx.objectStore('nodes')
    const fullTextIndexPaths = getTextIndexFields
      .call(this)
      .map((def) => def.jsonPath)
    if (graph.nodes) {
      let lastProgress = Math.round(percentProgress)
      for (const [, node] of graph.nodes.entries()) {
        percentProgress += 64 * (1 / graph.nodes.length)
        if (
          Math.round(percentProgress) != lastProgress &&
          percentProgress < 100
        ) {
          this.options.update?.('Processing nodes', percentProgress)
          lastProgress = Math.round(percentProgress)
        }
        if (isOntologyDBNode(node)) {
          await nodeStore.add({
            ...node,
            fullTextWords: serializeWords(
              getWords(node, fullTextIndexPaths, this.prefixes),
            ),
          })
        }
      }
    }

    // load edges
    const edgeStore = tx.objectStore('edges')
    if (graph.edges) {
      let lastProgress = Math.round(percentProgress)
      for (const [, edge] of graph.edges.entries()) {
        percentProgress += 30 * (1 / graph.edges.length)
        if (
          Math.round(percentProgress) != lastProgress &&
          percentProgress < 100
        ) {
          this.options.update?.('Processing edges', percentProgress)
          lastProgress = Math.round(percentProgress)
        }
        if (isOntologyDBEdge(edge)) {
          await edgeStore.add(edge)
        }
      }
    }
    await tx.done

    // record some metadata about this ontology and load operation
    const tx2 = db.transaction('meta', 'readwrite')
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { update, ...otherOptions } = this.options
    await tx2.objectStore('meta').delete('meta')
    await tx2.objectStore('meta').add(
      {
        ontologyRecord: {
          name: this.ontologyName,
          version: this.ontologyVersion,
          sourceLocation: this.sourceLocation,
        },
        storeOptions: otherOptions,
        graphMeta: graph.meta,
        timestamp: String(new Date()),
        schemaVersion,
        timings: {
          overall: Date.now() - startTime,
          load: Date.now() - parseTime,
        },
      },
      'meta',
    )

    await tx2.done
  } catch (error) {
    await db.transaction('meta', 'readwrite').objectStore('meta').clear()
    throw error
  }
  return
}

export function getTextIndexFields(this: OntologyStore) {
  return [
    { displayName: 'ID', jsonPath: PREFIXED_ID_PATH },
    ...(this.options.textIndexing?.indexFields ?? defaultTextIndexFields),
  ]
}

/**
 * Compare two prefix maps by their entries. A Map read back from IndexedDB can
 * come from a different realm than the one in the store options, so its
 * constructor differs and constructor-sensitive deep equality reports a
 * mismatch for identical entries.
 */
function samePrefixes(
  a: Map<string, string> | undefined,
  b: Map<string, string> | undefined,
) {
  if (!a || !b) {
    return !a && !b
  }
  if (a.size !== b.size) {
    return false
  }
  for (const [key, value] of a) {
    if (!b.has(key) || b.get(key) !== value) {
      return false
    }
  }
  return true
}

/**
 * Compare two text indexing options field by field. Constructor-sensitive deep
 * equality reports a mismatch between options read back from IndexedDB and
 * identical ones built here when the two come from different realms.
 */
function sameTextIndexing(
  a: OntologyStore['options']['textIndexing'],
  b: OntologyStore['options']['textIndexing'],
) {
  if (!a || !b) {
    return !a && !b
  }
  if (!a.indexFields || !b.indexFields) {
    return !a.indexFields && !b.indexFields
  }
  return (
    a.indexFields.length === b.indexFields.length &&
    a.indexFields.every(
      (field, index) =>
        field.displayName === b.indexFields?.[index].displayName &&
        field.jsonPath === b.indexFields[index].jsonPath,
    )
  )
}

export async function isDatabaseCurrent(this: OntologyStore, db: Database) {
  // since metadata is loaded last, we use it as a signal that all the other data
  // was loaded
  const [meta] = await db.transaction('meta').objectStore('meta').getAll()
  if (!meta) {
    return false
  }
  // check that the index paths and prefixes are the same as our current ones
  return (
    samePrefixes(this.options.prefixes, meta.storeOptions.prefixes) &&
    sameTextIndexing(this.options.textIndexing, meta.storeOptions.textIndexing)
  )
}
