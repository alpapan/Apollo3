import { User as UserSchema } from '@apollo-annotation/schemas'
import { jest } from '@jest/globals'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { Test, type TestingModule } from '@nestjs/testing'

import { MessagesGateway } from '../messages/messages.gateway.js'
import { Role } from '../utils/role/role.enum.js'

import { UsersService } from './users.service.js'

describe('UsersService', () => {
  let service: UsersService
  let findByIdAndUpdateSpy: jest.Mock
  let execSpy: jest.Mock

  beforeEach(async () => {
    execSpy = jest.fn().mockResolvedValue({})
    findByIdAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy })

    const userModel = {
      findByIdAndUpdate: findByIdAndUpdateSpy,
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(UserSchema.name), useValue: userModel },
        { provide: MessagesGateway, useValue: { create: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('updateRoleAndTracking updates role + lastId1Kid + lastId1BootId on the user document', async () => {
    await service.updateRoleAndTracking(
      'user-id-1',
      Role.Admin,
      'kid-A',
      'boot-X',
    )

    expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
      'user-id-1',
      { role: 'admin', lastId1Kid: 'kid-A', lastId1BootId: 'boot-X' },
      { new: true },
    )
    expect(execSpy).toHaveBeenCalled()
  })
})
