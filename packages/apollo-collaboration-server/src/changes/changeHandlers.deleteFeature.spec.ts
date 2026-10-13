import {
  Assembly,
  Change,
  Check,
  CheckResult,
  Feature,
  File,
  JBrowseConfig,
  RefSeq,
  RefSeqChunk,
  User,
} from '@apollo-annotation/schemas'
import { DeleteFeatureChange } from '@apollo-annotation/shared'
import { getModelToken } from '@nestjs/mongoose'
import { Test, type TestingModule } from '@nestjs/testing'
import { type ClientSession, Types } from 'mongoose'

import { CountersService } from '../counters/counters.service.js'
import { FilesService } from '../files/files.service.js'
import { MessagesGateway } from '../messages/messages.gateway.js'
import { PluginsService } from '../plugins/plugins.service.js'

import { ChangeHandlersService } from './changeHandlers.service.js'

const ASSEMBLY = 'assembly-1'
const REF_SEQ_ID = 'refseq-id-ctgA'

interface StoredFeature {
  _id: Types.ObjectId
  id: string
  allIds: string[]
  children?: Map<string, unknown>
  indexedIds?: string[]
  markModified(path: string): void
  save(): Promise<void>
}

interface DeleteManyCall {
  filter: { ids: { $in: string[] } }
  session?: unknown
}

/** Stands in for the Mongoose models, the database boundary. */
async function makeService(feature: StoredFeature) {
  const deleteManyCalls: DeleteManyCall[] = []
  const featureModel = {
    findOne: () => ({ session: () => ({ exec: async () => feature }) }),
    findByIdAndDelete: async () => feature,
  }
  const checkResultModel = {
    deleteMany: (filter: DeleteManyCall['filter']) => {
      const call: DeleteManyCall = { filter }
      deleteManyCalls.push(call)
      return {
        session: (session: unknown) => {
          call.session = session
          return Promise.resolve({ deletedCount: 0 })
        },
      }
    },
  }
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ChangeHandlersService,
      { provide: getModelToken(Feature.name), useValue: featureModel },
      { provide: getModelToken(CheckResult.name), useValue: checkResultModel },
      { provide: getModelToken(Assembly.name), useValue: {} },
      { provide: getModelToken(RefSeq.name), useValue: {} },
      { provide: getModelToken(RefSeqChunk.name), useValue: {} },
      { provide: getModelToken(File.name), useValue: {} },
      { provide: getModelToken(User.name), useValue: {} },
      { provide: getModelToken(JBrowseConfig.name), useValue: {} },
      { provide: getModelToken(Change.name), useValue: {} },
      { provide: getModelToken(Check.name), useValue: {} },
      { provide: FilesService, useValue: {} },
      { provide: CountersService, useValue: {} },
      { provide: PluginsService, useValue: {} },
      { provide: MessagesGateway, useValue: {} },
    ],
  }).compile()
  return {
    service: module.get<ChangeHandlersService>(ChangeHandlersService),
    deleteManyCalls,
  }
}

function deleteChange(deletedId: string, parentFeatureId?: string) {
  return new DeleteFeatureChange({
    typeName: 'DeleteFeatureChange',
    assembly: ASSEMBLY,
    changedIds: [parentFeatureId ?? deletedId],
    deletedFeature: {
      _id: deletedId,
      refSeq: REF_SEQ_ID,
      min: 10,
      max: 20,
      type: deletedId === 'mrna-1' ? 'mRNA' : 'gene',
    },
    parentFeatureId,
  })
}

const context = { session: {} as ClientSession, user: 'tester' }

describe('ChangeHandlersService.DeleteFeatureChange', () => {
  it('removes the check results of every feature in a deleted top-level document', async () => {
    const geneId = new Types.ObjectId()
    const feature: StoredFeature = {
      _id: geneId,
      id: geneId.toString(),
      allIds: [geneId.toString(), 'mrna-1'],
      markModified: () => undefined,
      save: async () => undefined,
    }
    const { service, deleteManyCalls } = await makeService(feature)

    await service.DeleteFeatureChange(
      deleteChange(geneId.toString()),
      context,
    )

    expect(deleteManyCalls).toEqual([
      {
        filter: { ids: { $in: [geneId.toString(), 'mrna-1'] } },
        session: context.session,
      },
    ])
  })

  it('removes the check results of a deleted child and its descendants only', async () => {
    const geneId = new Types.ObjectId()
    const feature: StoredFeature = {
      _id: geneId,
      id: geneId.toString(),
      allIds: [geneId.toString(), 'mrna-1', 'exon-1'],
      children: new Map([
        [
          'mrna-1',
          {
            _id: 'mrna-1',
            refSeq: REF_SEQ_ID,
            min: 10,
            max: 20,
            type: 'mRNA',
            children: new Map([
              [
                'exon-1',
                {
                  _id: 'exon-1',
                  refSeq: REF_SEQ_ID,
                  min: 10,
                  max: 20,
                  type: 'exon',
                },
              ],
            ]),
          },
        ],
      ]),
      markModified: () => undefined,
      save: async () => undefined,
    }
    const { service, deleteManyCalls } = await makeService(feature)

    await service.DeleteFeatureChange(
      deleteChange('mrna-1', geneId.toString()),
      context,
    )

    expect(deleteManyCalls.map((c) => [...c.filter.ids.$in].sort())).toEqual([
      ['exon-1', 'mrna-1'],
    ])
  })
})
