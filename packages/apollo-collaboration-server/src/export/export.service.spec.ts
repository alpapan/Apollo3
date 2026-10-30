import { Readable } from 'node:stream'

import {
  Assembly,
  Export,
  Feature,
  File,
  RefSeq,
  RefSeqChunk,
} from '@apollo-annotation/schemas'
import { jest } from '@jest/globals'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { Test, type TestingModule } from '@nestjs/testing'

import { ExportService } from './export.service.js'

describe('ExportService', () => {
  let service: ExportService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: getModelToken(Assembly.name), useValue: {} },
        { provide: getModelToken(Export.name), useValue: {} },
        { provide: getModelToken(Feature.name), useValue: {} },
        { provide: getModelToken(File.name), useValue: {} },
        { provide: getModelToken(RefSeq.name), useValue: {} },
        { provide: getModelToken(RefSeqChunk.name), useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile()

    service = module.get<ExportService>(ExportService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})

const emptyFind = () => ({
  exec: () => Promise.resolve([]),
  cursor: () => Readable.from([]),
})

describe('ExportService.exportGFF3 expiry', () => {
  const FIVE_MINUTES_MS = 5 * 60 * 1000
  const ASSEMBLY = 'assembly-1'

  function makeService(createdAt: Date) {
    const exportModel = {
      findById: () =>
        Promise.resolve({
          assembly: ASSEMBLY,
          get: (path: string) => (path === 'createdAt' ? createdAt : undefined),
        }),
    }
    const emptyModel = { find: emptyFind }
    return new ExportService(
      {} as never,
      exportModel as never,
      emptyModel as never,
      {} as never,
      emptyModel as never,
      {} as never,
      { get: jest.fn() } as never,
    )
  }

  it('serves an export id created 4 minutes ago', async () => {
    const service = makeService(new Date(Date.now() - FIVE_MINUTES_MS + 60_000))

    const [stream, assembly] = await service.exportGFF3('id', {})

    expect(assembly).toBe(ASSEMBLY)
    stream.destroy()
  })

  it('refuses an export id created 6 minutes ago', async () => {
    const service = makeService(new Date(Date.now() - FIVE_MINUTES_MS - 60_000))

    await expect(service.exportGFF3('id', {})).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
