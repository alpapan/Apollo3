import { User as UserSchema } from '@apollo-annotation/schemas'
import { jest } from '@jest/globals'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { Test, type TestingModule } from '@nestjs/testing'

import { MessagesGateway } from '../messages/messages.gateway.js'

import { UsersController } from './users.controller.js'
import { UsersService } from './users.service.js'

describe('UsersController', () => {
  let controller: UsersController

  beforeEach(async () => {
    const userModel = {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: getModelToken(UserSchema.name), useValue: userModel },
        { provide: MessagesGateway, useValue: { create: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile()

    controller = module.get<UsersController>(UsersController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
