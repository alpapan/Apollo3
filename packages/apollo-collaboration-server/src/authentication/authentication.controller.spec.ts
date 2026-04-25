import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'

import { AuthenticationController } from './authentication.controller.js'
import { AuthenticationService } from './authentication.service.js'

describe('AuthenticationController', () => {
  let controller: AuthenticationController
  let exchangeSpy: jest.Mock

  beforeEach(async () => {
    exchangeSpy = jest.fn().mockResolvedValue({ token: 'apollo-canned' })
    const authService = { exchangeCuratoriumToken: exchangeSpy }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthenticationController],
      providers: [{ provide: AuthenticationService, useValue: authService }],
    }).compile()

    controller = module.get<AuthenticationController>(AuthenticationController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  it('curatoriumExchange forwards inner token and returns service response unchanged', async () => {
    const result = await controller.curatoriumExchange({
      token: 'inner-jwt-placeholder',
    })

    expect(exchangeSpy).toHaveBeenCalledWith('inner-jwt-placeholder')
    expect(result).toEqual({ token: 'apollo-canned' })
  })
})
