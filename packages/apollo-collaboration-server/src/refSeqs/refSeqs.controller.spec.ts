import { Assembly, RefSeq } from '@apollo-annotation/schemas'
import { jest } from '@jest/globals'
import { getModelToken } from '@nestjs/mongoose'
import { Test, type TestingModule } from '@nestjs/testing'

import { RefSeqsController } from './refSeqs.controller.js'
import { RefSeqsService } from './refSeqs.service.js'

describe('RefSeqsController', () => {
  let controller: RefSeqsController

  beforeEach(async () => {
    const mockRefSeqModel = {
      find: jest.fn(),
    }
    const mockAssemblyModel = {
      findOne: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RefSeqsController],
      providers: [
        RefSeqsService,
        {
          provide: getModelToken(RefSeq.name),
          useValue: mockRefSeqModel,
        },
        {
          provide: getModelToken(Assembly.name),
          useValue: mockAssemblyModel,
        },
      ],
    }).compile()

    controller = module.get<RefSeqsController>(RefSeqsController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
