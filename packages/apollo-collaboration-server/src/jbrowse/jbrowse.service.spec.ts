import { JBrowseConfig } from '@apollo-annotation/schemas'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { Test, type TestingModule } from '@nestjs/testing'

import { AssembliesService } from '../assemblies/assemblies.service.js'
import { RefSeqsService } from '../refSeqs/refSeqs.service.js'

import { JBrowseService } from './jbrowse.service.js'

describe('JBrowseService', () => {
  let service: JBrowseService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JBrowseService,
        { provide: AssembliesService, useValue: {} },
        { provide: RefSeqsService, useValue: {} },
        { provide: getModelToken(JBrowseConfig.name), useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile()

    service = module.get<JBrowseService>(JBrowseService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('getPlugins returns Apollo and Primer3Plugin entries with stable URLs', () => {
    const plugins = service.getPlugins()
    // Assert both name AND url literals so a future change swapping the
    // primer3 URL to an attacker origin (or dropping the entry entirely)
    // cannot pass this test silently. The col-server's
    // /apollo/jbrowse/config.json ships whatever this method returns.
    expect(plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Apollo' }),
        expect.objectContaining({
          name: 'Primer3Plugin',
          url: '/jbrowse-plugins/primer3.umd.js',
        }),
      ]),
    )
  })
})
