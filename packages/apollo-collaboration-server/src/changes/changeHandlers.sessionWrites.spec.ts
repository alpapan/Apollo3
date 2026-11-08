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
  AddAssemblyAliasesChange,
  ImportJBrowseConfigChange,
} from '@apollo-annotation/shared'
import { getModelToken } from '@nestjs/mongoose'
import { Test, type TestingModule } from '@nestjs/testing'
import type { ClientSession } from 'mongoose'

import { CountersService } from '../counters/counters.service.js'
import { FilesService } from '../files/files.service.js'
import { MessagesGateway } from '../messages/messages.gateway.js'
import { PluginsService } from '../plugins/plugins.service.js'

import { ChangeHandlersService } from './changeHandlers.service.js'

const ASSEMBLY = 'assembly-1'
const context = { session: {} as ClientSession, user: 'tester' }

interface Models {
  assemblyModel?: unknown
  jbrowseConfigModel?: unknown
  refSeqModel?: unknown
}

/** Stands in for the Mongoose models, the database boundary. */
async function makeService(models: Models) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ChangeHandlersService,
      { provide: getModelToken(Assembly.name), useValue: models.assemblyModel },
      { provide: getModelToken(Feature.name), useValue: {} },
      { provide: getModelToken(File.name), useValue: {} },
      {
        provide: getModelToken(JBrowseConfig.name),
        useValue: models.jbrowseConfigModel,
      },
      { provide: getModelToken(RefSeq.name), useValue: models.refSeqModel },
      { provide: getModelToken(CheckResult.name), useValue: {} },
      { provide: getModelToken(RefSeqChunk.name), useValue: {} },
      { provide: getModelToken(User.name), useValue: {} },
      { provide: getModelToken(Change.name), useValue: {} },
      { provide: getModelToken(Check.name), useValue: {} },
      { provide: FilesService, useValue: {} },
      { provide: CountersService, useValue: {} },
      { provide: PluginsService, useValue: {} },
      { provide: MessagesGateway, useValue: {} },
    ],
  }).compile()
  return module.get<ChangeHandlersService>(ChangeHandlersService)
}

describe('ChangeHandlersService writes inside the change transaction', () => {
  it('AddAssemblyAliasesChange reads and saves the assembly in the session', async () => {
    const readSessions: unknown[] = []
    const saveOptions: unknown[] = []
    const assemblyDoc = {
      aliases: [] as string[],
      save: (options?: unknown) => {
        saveOptions.push(options)
        return Promise.resolve()
      },
    }
    const assemblyModel = {
      findById: () => ({
        session: (session: unknown) => {
          readSessions.push(session)
          return Promise.resolve(assemblyDoc)
        },
      }),
    }
    const service = await makeService({ assemblyModel })

    await service.AddAssemblyAliasesChange(
      new AddAssemblyAliasesChange({
        typeName: 'AddAssemblyAliasesChange',
        assembly: ASSEMBLY,
        aliases: ['alias-1'],
      }),
      context,
    )

    expect(assemblyDoc.aliases).toEqual(['alias-1'])
    expect(readSessions).toEqual([context.session])
    expect(saveOptions).toEqual([{ session: context.session }])
  })

  it('ImportJBrowseConfigChange replaces the stored config in the session', async () => {
    const deleteSessions: unknown[] = []
    const createCalls: { docs: unknown; options: unknown }[] = []
    const jbrowseConfigModel = {
      deleteMany: () => ({
        session: (session: unknown) => {
          deleteSessions.push(session)
          return Promise.resolve({ deletedCount: 1 })
        },
      }),
      create: (docs: unknown, options: unknown) => {
        createCalls.push({ docs, options })
        return Promise.resolve([])
      },
    }
    const service = await makeService({ jbrowseConfigModel })

    await service.ImportJBrowseConfigChange(
      new ImportJBrowseConfigChange({
        typeName: 'ImportJBrowseConfigChange',
        newJBrowseConfig: { configuration: {} },
      }),
      context,
    )

    expect(deleteSessions).toEqual([context.session])
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]?.options).toEqual({ session: context.session })
  })
})
