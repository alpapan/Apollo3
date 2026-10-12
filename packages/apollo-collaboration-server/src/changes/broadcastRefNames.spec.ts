import type { FeatureChange } from '@apollo-annotation/common'
import type {
  FeatureDocument,
  RefSeqDocument,
} from '@apollo-annotation/schemas'
import {
  AddFeatureChange,
  DeleteFeatureChange,
} from '@apollo-annotation/shared'
import type { Model } from 'mongoose'

import { resolveBroadcastRefNames } from './broadcastRefNames.js'

const ASSEMBLY = 'assembly-1'
const REF_SEQ_ID = 'refseq-id-ctgA'
const REF_SEQ_NAME = 'ctgA'

interface StoredFeature {
  allIds: string[]
  refSeq: string
}

/** Stands in for the Mongoose models, the database boundary. */
function makeModels(features: StoredFeature[]) {
  const refSeqs = [{ _id: REF_SEQ_ID, name: REF_SEQ_NAME }]
  const featureModel = {
    findOne: (filter: { allIds: string }) => ({
      exec: async () =>
        features.find((f) => f.allIds.includes(filter.allIds)) ?? null,
    }),
  }
  const refSeqModel = {
    findById: (id: string) => ({
      exec: async () => refSeqs.find((r) => r._id === id) ?? null,
    }),
  }
  return {
    featureModel: featureModel as unknown as Model<FeatureDocument>,
    refSeqModel: refSeqModel as unknown as Model<RefSeqDocument>,
  }
}

function addFeature(id: string, parentFeatureId?: string) {
  return new AddFeatureChange({
    typeName: 'AddFeatureChange',
    assembly: ASSEMBLY,
    changedIds: [parentFeatureId ?? id],
    addedFeature: {
      _id: id,
      refSeq: REF_SEQ_ID,
      min: 10,
      max: 20,
      type: 'gene',
    },
    parentFeatureId,
  })
}

describe('resolveBroadcastRefNames', () => {
  it('names the refSeq of a new top-level feature that is not stored yet', async () => {
    const models = makeModels([])

    const names = await resolveBroadcastRefNames(addFeature('new-gene'), models)

    expect(names).toEqual([REF_SEQ_NAME])
  })

  it('names the refSeq of a stored feature the change edits', async () => {
    const models = makeModels([{ allIds: ['gene-1'], refSeq: REF_SEQ_ID }])
    const change = new DeleteFeatureChange({
      typeName: 'DeleteFeatureChange',
      assembly: ASSEMBLY,
      changedIds: ['gene-1'],
      deletedFeature: {
        _id: 'gene-1',
        refSeq: REF_SEQ_ID,
        min: 10,
        max: 20,
        type: 'gene',
      },
    })

    const names = await resolveBroadcastRefNames(change, models)

    expect(names).toEqual([REF_SEQ_NAME])
  })

  it('names a refSeq once when the parent and the added child are both on it', async () => {
    const models = makeModels([{ allIds: ['gene-1'], refSeq: REF_SEQ_ID }])

    const names = await resolveBroadcastRefNames(
      addFeature('mrna-1', 'gene-1'),
      models,
    )

    expect(names).toEqual([REF_SEQ_NAME])
  })

  it('names no refSeq for a change whose features exist nowhere', async () => {
    const models = makeModels([])
    const change = { changedIds: ['ghost'] } as unknown as FeatureChange

    expect(await resolveBroadcastRefNames(change, models)).toEqual([])
  })
})
