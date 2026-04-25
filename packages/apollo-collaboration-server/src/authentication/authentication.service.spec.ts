import { randomUUID } from 'node:crypto'

import { jest } from '@jest/globals'
import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, type TestingModule } from '@nestjs/testing'
import jwt from 'jsonwebtoken'

import { UsersService } from '../users/users.service.js'
import { Role } from '../utils/role/role.enum.js'

import { AuthenticationService } from './authentication.service.js'

const TEST_EXCHANGE_SECRET = 'a'.repeat(64)
const TEST_APOLLO_JWT_SECRET = 'b'.repeat(64)

interface InnerClaimsOverride {
  username?: string
  email?: string
  role?: string
  id1_kid?: string
  id1_boot_id?: string
  jti?: string
  expSeconds?: number
}

function buildInnerClaims(overrides: InnerClaimsOverride = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    username: overrides.username ?? 'apollo-0000-0001-0000-0001',
    email: overrides.email ?? '0000-0001-0000-0001@curatorium.app',
    role: overrides.role ?? 'user',
    id1_kid: overrides.id1_kid ?? 'kid-1',
    id1_boot_id: overrides.id1_boot_id ?? 'boot-1',
    jti: overrides.jti ?? randomUUID(),
    iat: now,
    exp: now + (overrides.expSeconds ?? 60),
  }
}

function signInnerJwt(claims: object, secret = TEST_EXCHANGE_SECRET) {
  return jwt.sign(claims, secret, { algorithm: 'HS256' })
}

describe('AuthenticationService', () => {
  let service: AuthenticationService
  let usersService: {
    findByEmail: jest.Mock
    addNew: jest.Mock
    updateRoleAndTracking: jest.Mock
    findAll: jest.Mock
  }
  let configService: { get: jest.Mock }

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      addNew: jest.fn(),
      updateRoleAndTracking: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
    }
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'CURATORIUM_EXCHANGE_SECRET') {
          return TEST_EXCHANGE_SECRET
        }
        if (key === 'DEFAULT_NEW_USER_ROLE') {
          return Role.User
        }
        return
      }),
    }

    const jwtService = new JwtService({
      secret: TEST_APOLLO_JWT_SECRET,
      signOptions: { algorithm: 'HS256' },
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()

    service = module.get<AuthenticationService>(AuthenticationService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('exchangeCuratoriumToken_acceptsValidTokenAndReturnsApolloJwt', async () => {
    usersService.findByEmail.mockResolvedValue(null)
    usersService.addNew.mockResolvedValue({
      id: 'mongo-id-1',
      username: 'apollo-0000-0001-0000-0001',
      email: '0000-0001-0000-0001@curatorium.app',
      role: 'user',
    })

    const claims = buildInnerClaims()
    const innerJwt = signInnerJwt(claims)

    const result = await service.exchangeCuratoriumToken(innerJwt)

    expect(result).toHaveProperty('token')
    const decoded = jwt.verify(result.token, TEST_APOLLO_JWT_SECRET) as {
      username: string
      email: string
      role: string
      id: string
    }
    expect(decoded.email).toBe(claims.email)
    expect(decoded.role).toBe('user')
    expect(decoded.id).toBe('mongo-id-1')
    // No iss=curatorium-backend — Apollo mints, not curatorium
    expect((decoded as { iss?: string }).iss).not.toBe('curatorium-backend')
  })

  it('exchangeCuratoriumToken_rejectsMalformedToken', async () => {
    await expect(
      service.exchangeCuratoriumToken('not-a-jwt-at-all'),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('exchangeCuratoriumToken_rejectsWrongSecret', async () => {
    const claims = buildInnerClaims()
    const innerJwt = signInnerJwt(claims, 'c'.repeat(64)) // wrong secret
    await expect(
      service.exchangeCuratoriumToken(innerJwt),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('exchangeCuratoriumToken_rejectsExpired', async () => {
    const claims = buildInnerClaims({ expSeconds: -120 }) // expired 2 min ago
    const innerJwt = signInnerJwt(claims)
    await expect(
      service.exchangeCuratoriumToken(innerJwt),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('exchangeCuratoriumToken_rejectsReplayWithinWindow', async () => {
    usersService.findByEmail.mockResolvedValue(null)
    usersService.addNew.mockResolvedValue({
      id: 'mongo-id-1',
      username: 'apollo-0000-0001-0000-0001',
      email: '0000-0001-0000-0001@curatorium.app',
      role: 'user',
    })
    const claims = buildInnerClaims({ jti: randomUUID() })
    const innerJwt = signInnerJwt(claims)

    await service.exchangeCuratoriumToken(innerJwt)
    await expect(
      service.exchangeCuratoriumToken(innerJwt),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('exchangeCuratoriumToken_createsUserOnFirstLogin', async () => {
    usersService.findByEmail.mockResolvedValue(null)
    usersService.addNew.mockResolvedValue({
      id: 'mongo-id-new',
      username: 'apollo-0000-0001-0000-0001',
      email: '0000-0001-0000-0001@curatorium.app',
      role: 'user',
    })

    const claims = buildInnerClaims({
      role: 'user',
      id1_kid: 'kid-A',
      id1_boot_id: 'boot-X',
    })
    await service.exchangeCuratoriumToken(signInnerJwt(claims))

    expect(usersService.addNew).toHaveBeenCalledWith({
      username: claims.username,
      email: claims.email,
      role: 'user',
    })
    expect(usersService.updateRoleAndTracking).toHaveBeenCalledWith(
      'mongo-id-new',
      'user',
      'kid-A',
      'boot-X',
    )
  })

  it('exchangeCuratoriumToken_doesNotResyncRoleWhenKidAndBootIdMatch', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'mongo-id-existing',
      username: 'apollo-0000-0001-0000-0001',
      email: '0000-0001-0000-0001@curatorium.app',
      role: 'user',
      lastId1Kid: 'kid-1',
      lastId1BootId: 'boot-1',
    })

    const claims = buildInnerClaims({
      id1_kid: 'kid-1',
      id1_boot_id: 'boot-1',
    })
    await service.exchangeCuratoriumToken(signInnerJwt(claims))

    expect(usersService.addNew).not.toHaveBeenCalled()
    expect(usersService.updateRoleAndTracking).not.toHaveBeenCalled()
  })

  it('exchangeCuratoriumToken_resyncsRoleWhenKidChanges', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'mongo-id-existing',
      username: 'apollo-0000-0001-0000-0001',
      email: '0000-0001-0000-0001@curatorium.app',
      role: 'user',
      lastId1Kid: 'kid-OLD',
      lastId1BootId: 'boot-1',
    })

    const claims = buildInnerClaims({
      role: 'admin',
      id1_kid: 'kid-NEW',
      id1_boot_id: 'boot-1',
    })
    await service.exchangeCuratoriumToken(signInnerJwt(claims))

    expect(usersService.updateRoleAndTracking).toHaveBeenCalledWith(
      'mongo-id-existing',
      'admin',
      'kid-NEW',
      'boot-1',
    )
  })

  it('exchangeCuratoriumToken_resyncsRoleWhenBootIdChanges', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'mongo-id-existing',
      username: 'apollo-0000-0001-0000-0001',
      email: '0000-0001-0000-0001@curatorium.app',
      role: 'user',
      lastId1Kid: 'kid-1',
      lastId1BootId: 'boot-OLD',
    })

    const claims = buildInnerClaims({
      role: 'readOnly',
      id1_kid: 'kid-1',
      id1_boot_id: 'boot-NEW',
    })
    await service.exchangeCuratoriumToken(signInnerJwt(claims))

    expect(usersService.updateRoleAndTracking).toHaveBeenCalledWith(
      'mongo-id-existing',
      'readOnly',
      'kid-1',
      'boot-NEW',
    )
  })

  describe.each([['superuser'], ['none']])('rejects role=%s', (badRole) => {
    it(`rejects role=${badRole} with UnauthorizedException`, async () => {
      const claims = buildInnerClaims({ role: badRole })
      const innerJwt = signInnerJwt(claims)
      await expect(
        service.exchangeCuratoriumToken(innerJwt),
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })
  })

  it('exchangeCuratoriumToken_handlesRoleDemotion', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'mongo-id-demote',
      username: 'apollo-0000-0001-0000-0001',
      email: '0000-0001-0000-0001@curatorium.app',
      role: 'admin',
      lastId1Kid: 'k1',
      lastId1BootId: 'b1',
    })

    const claims = buildInnerClaims({
      role: 'user',
      id1_kid: 'k2',
      id1_boot_id: 'b1',
    })
    await service.exchangeCuratoriumToken(signInnerJwt(claims))

    expect(usersService.updateRoleAndTracking).toHaveBeenCalledWith(
      'mongo-id-demote',
      'user',
      'k2',
      'b1',
    )
  })

  it('exchangeCuratoriumToken_doesNotApplyFirstUserAdminFallback', async () => {
    // Empty users collection — what would normally trigger logIn's
    // first-user-becomes-admin fallback
    usersService.findAll.mockResolvedValue([])
    usersService.findByEmail.mockResolvedValue(null)
    let capturedRole: string | undefined
    usersService.addNew.mockImplementation(async (dto: { role: string }) => {
      capturedRole = dto.role
      return {
        id: 'mongo-id-new',
        username: 'apollo-0000-0001-0000-0001',
        email: '0000-0001-0000-0001@curatorium.app',
        role: dto.role,
      }
    })

    const claims = buildInnerClaims({ role: 'user' })
    await service.exchangeCuratoriumToken(signInnerJwt(claims))

    expect(capturedRole).toBe('user')
    expect(capturedRole).not.toBe(Role.Admin)
    expect(usersService.findAll).not.toHaveBeenCalled()
  })
})
