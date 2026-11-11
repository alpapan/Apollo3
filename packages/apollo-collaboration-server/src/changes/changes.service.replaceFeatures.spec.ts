import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

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
import {
  AddFeaturesFromFileChange,
  type DecodedJWT,
  Validation,
  type ValidationResult,
  validationRegistry,
} from '@apollo-annotation/shared'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { Test } from '@nestjs/testing'
import { type ClientSession, Types } from 'mongoose'

import { CountersService } from '../counters/counters.service.js'
import { FilesService } from '../files/files.service.js'
import { MessagesGateway } from '../messages/messages.gateway.js'
import { PluginsService } from '../plugins/plugins.service.js'

import { ChangeHandlersService } from './changeHandlers.service.js'
import { ChangesService } from './changes.service.js'

const ASSEMBLY = 'assembly-1'
const CHECKSUM = 'features-gff3'
const GFF3 = '##gff-version 3\nctgA\ttest\tgene\t1\t100\t.\t+\t.\tID=gene-1\n'

class RejectEveryChange extends Validation {
  name = 'RejectEveryChange'
  backendPostValidate(): Promise<ValidationResult> {
    return Promise.resolve({
      validationName: this.name,
      error: { message: 'post-validation says no' },
    })
  }
}

/**
 * Real ChangesService, ChangeHandlersService, FilesService and CountersService
 * over a real gzipped GFF3 file; only the Mongoose models (database) and the
 * socket gateway are faked.
 */
async function setup(uploadFolder: string) {
  const refSeqId = new Types.ObjectId()
  const events: string[] = []
  const deleteFilters: unknown[] = []
  const session = {} as ClientSession
  const featureModel = {
    db: {
      transaction: (callback: (s: ClientSession) => Promise<void>) =>
        callback(session),
    },
    create: () => {
      events.push('import')
      return Promise.resolve([])
    },
    deleteMany: (filter: unknown) => {
      events.push('delete')
      deleteFilters.push(filter)
      return { exec: () => Promise.resolve({ deletedCount: 1 }) }
    },
    find: () => ({ limit: () => ({ exec: () => Promise.resolve([]) }) }),
  }
  const emptyBatchModel = { find: featureModel.find }
  const refSeqModel = {
    ...emptyBatchModel,
    find: (filter: object) =>
      'assembly' in filter
        ? { exec: () => Promise.resolve([{ _id: refSeqId }]) }
        : featureModel.find(),
    findOne: () => ({ exec: () => Promise.resolve({ _id: refSeqId }) }),
  }
  const fileModel = {
    findById: () => ({
      exec: () => Promise.resolve({ checksum: CHECKSUM, type: 'text/x-gff3' }),
    }),
  }
  const changeModel = {
    create: () => Promise.resolve([{ _id: new Types.ObjectId(), sequence: 1 }]),
  }
  const counterModel = {
    findOneAndUpdate: () => ({
      exec: () => Promise.resolve({ sequenceValue: 1 }),
    }),
  }
  const module = await Test.createTestingModule({
    providers: [
      ChangeHandlersService,
      FilesService,
      { provide: ConfigService, useValue: { get: () => uploadFolder } },
      { provide: getModelToken(Feature.name), useValue: featureModel },
      { provide: getModelToken(File.name), useValue: fileModel },
      { provide: getModelToken(RefSeq.name), useValue: refSeqModel },
      { provide: getModelToken(Assembly.name), useValue: emptyBatchModel },
      { provide: getModelToken(RefSeqChunk.name), useValue: emptyBatchModel },
      { provide: getModelToken(CheckResult.name), useValue: {} },
      { provide: getModelToken(JBrowseConfig.name), useValue: {} },
      { provide: getModelToken(User.name), useValue: {} },
      { provide: getModelToken(Change.name), useValue: changeModel },
      { provide: getModelToken(Check.name), useValue: {} },
      {
        provide: CountersService,
        useValue: new CountersService(counterModel as never),
      },
      { provide: PluginsService, useValue: {} },
      {
        provide: MessagesGateway,
        useValue: { create: () => Promise.resolve() },
      },
    ],
  }).compile()
  const service = new ChangesService(
    featureModel as never,
    emptyBatchModel as never,
    refSeqModel as never,
    emptyBatchModel as never,
    changeModel as never,
    module.get(CountersService),
    module.get(MessagesGateway),
    module.get(ChangeHandlersService),
  )
  return { service, events, deleteFilters, refSeqId }
}

function replaceFeatures() {
  return new AddFeaturesFromFileChange({
    typeName: 'AddFeaturesFromFileChange',
    assembly: ASSEMBLY,
    fileId: 'file-1',
    deleteExistingFeatures: true,
  })
}

const user = {
  email: 'tester@example.org',
  username: 'tester',
  role: 'user',
} as unknown as DecodedJWT

describe('ChangesService.create with AddFeaturesFromFileChange deleteExistingFeatures', () => {
  let uploadFolder: string
  let previousUploadFolder: string | undefined
  const rejecter = new RejectEveryChange()

  beforeEach(async () => {
    uploadFolder = await mkdtemp(path.join(tmpdir(), 'apollo-replace-'))
    await writeFile(path.join(uploadFolder, CHECKSUM), gzipSync(GFF3))
    previousUploadFolder = process.env.FILE_UPLOAD_FOLDER
    process.env.FILE_UPLOAD_FOLDER = uploadFolder
  })
  afterEach(async () => {
    validationRegistry.validations.delete(rejecter)
    if (previousUploadFolder === undefined) {
      delete process.env.FILE_UPLOAD_FOLDER
    } else {
      process.env.FILE_UPLOAD_FOLDER = previousUploadFolder
    }
    await rm(uploadFolder, { recursive: true, force: true })
  })

  it('keeps the existing features when post-validation rejects the change', async () => {
    const { service, events, deleteFilters } = await setup(uploadFolder)
    validationRegistry.registerValidation(rejecter)

    await expect(service.create(replaceFeatures(), user)).rejects.toThrow(
      'post-validation says no',
    )

    expect(events).toEqual(['import'])
    expect(deleteFilters).toEqual([])
  })

  it('removes only the settled features, after the import and before they are finalised', async () => {
    const { service, events, deleteFilters, refSeqId } =
      await setup(uploadFolder)

    await service.create(replaceFeatures(), user)

    expect(events).toEqual(['import', 'delete'])
    expect(deleteFilters).toEqual([{ refSeq: refSeqId, status: { $ne: -1 } }])
  })
})
