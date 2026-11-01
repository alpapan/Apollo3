import { UnauthorizedException } from '@nestjs/common'
import jwt from 'jsonwebtoken'

import {
  TEST_APOLLO_JWT_SECRET,
  makeAuthenticationService,
} from './authentication.test-support.js'

describe('AuthenticationService.rootLogin', () => {
  it('logs in as root when allowed and the password matches', async () => {
    const { service } = makeAuthenticationService({
      ALLOW_ROOT_USER: true,
      ROOT_USER_PASSWORD: 'correct-password',
    })

    const result = await service.rootLogin('correct-password')

    const decoded = jwt.verify(result.token, TEST_APOLLO_JWT_SECRET) as {
      role: string
    }
    expect(decoded.role).toBe('admin')
  })

  it('refuses a correct password when ALLOW_ROOT_USER is unset', async () => {
    const { service } = makeAuthenticationService({
      ROOT_USER_PASSWORD: 'correct-password',
    })

    await expect(service.rootLogin('correct-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('refuses a correct password when ALLOW_ROOT_USER is false', async () => {
    const { service } = makeAuthenticationService({
      ALLOW_ROOT_USER: false,
      ROOT_USER_PASSWORD: 'correct-password',
    })

    await expect(service.rootLogin('correct-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('refuses a missing password when ROOT_USER_PASSWORD is unset', async () => {
    const { service } = makeAuthenticationService({ ALLOW_ROOT_USER: true })

    await expect(
      service.rootLogin(undefined as unknown as string),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('refuses an empty password when ROOT_USER_PASSWORD is empty', async () => {
    const { service } = makeAuthenticationService({
      ALLOW_ROOT_USER: true,
      ROOT_USER_PASSWORD: '',
    })

    await expect(service.rootLogin('')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('refuses a wrong password', async () => {
    const { service } = makeAuthenticationService({
      ALLOW_ROOT_USER: true,
      ROOT_USER_PASSWORD: 'correct-password',
    })

    await expect(service.rootLogin('wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })
})
