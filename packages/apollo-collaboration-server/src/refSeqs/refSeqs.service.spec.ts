import {
  Assembly,
  RefSeq,
  type AssemblyDocument,
  type RefSeqDocument,
} from '@apollo-annotation/schemas'
import { jest } from '@jest/globals'
import { NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/mongoose'
import { Test, type TestingModule } from '@nestjs/testing'
import { Types } from 'mongoose'

import { RefSeqsService } from './refSeqs.service.js'

describe('RefSeqsService', () => {
  let service: RefSeqsService
  let mockRefSeqModel: any
  let mockAssemblyModel: any

  beforeEach(async () => {
    mockRefSeqModel = {
      find: jest.fn(),
    }
    mockAssemblyModel = {
      findOne: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<RefSeqsService>(RefSeqsService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('findAll', () => {
    it('should resolve assembly name to ObjectId before querying', async () => {
      const mockAssemblyId = new Types.ObjectId()
      const mockRefSeqs = [{ _id: 'ref1', assembly: mockAssemblyId }]

      mockAssemblyModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: mockAssemblyId,
          name: 'volvox',
        }),
      })

      mockRefSeqModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRefSeqs),
      })

      const result = await service.findAll({ assembly: 'volvox' })

      expect(mockAssemblyModel.findOne).toHaveBeenCalledWith({ name: 'volvox' })
      expect(mockRefSeqModel.find).toHaveBeenCalledWith({
        assembly: mockAssemblyId.toString(),
      })
      expect(result).toEqual(mockRefSeqs)
    })

    it('should throw NotFoundException when assembly name does not exist', async () => {
      mockAssemblyModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      })

      await expect(
        service.findAll({ assembly: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException)
      await expect(
        service.findAll({ assembly: 'nonexistent' }),
      ).rejects.toThrow(/Assembly "nonexistent" not found/)
    })

    it('should pass through 24-char hex string as ObjectId without name lookup', async () => {
      const validObjectIdString = new Types.ObjectId().toHexString()
      const mockRefSeqs = [{ _id: 'ref1', assembly: validObjectIdString }]

      mockRefSeqModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRefSeqs),
      })

      const result = await service.findAll({ assembly: validObjectIdString })

      expect(mockAssemblyModel.findOne).not.toHaveBeenCalled()
      expect(mockRefSeqModel.find).toHaveBeenCalledWith({
        assembly: validObjectIdString,
      })
      expect(result).toEqual(mockRefSeqs)
    })

    it('should query without filter when assembly is not provided', async () => {
      const mockRefSeqs = [{ _id: 'ref1' }]

      mockRefSeqModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRefSeqs),
      })

      const result = await service.findAll({})

      expect(mockAssemblyModel.findOne).not.toHaveBeenCalled()
      expect(mockRefSeqModel.find).toHaveBeenCalledWith({})
      expect(result).toEqual(mockRefSeqs)
    })
  })
})
