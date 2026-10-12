import { randomUUID } from 'node:crypto'

import { UnauthorizedException } from '@nestjs/common'
import jwt from 'jsonwebtoken'

import { Role } from '../utils/role/role.enum.js'

import {
  TEST_APOLLO_JWT_SECRET,
  buildInnerClaims,
  makeAuthenticationService,
  signInnerJwt,
} from './authentication.test-support.js'

const EMAIL = '0000-0001-0000-0001@curatorium.app'
const USERNAME = 'apollo-0000-0001-0000-0001'

function decode(token: string) {
  return jwt.verify(token, TEST_APOLLO_JWT_SECRET) as {
    username: string
    email: string
    role: string
    id: string
    iss?: string
  }
}

describe('AuthenticationService', () => {
  let { service, userModel } = makeAuthenticationService()

  beforeEach(() => {
    ;({ service, userModel } = makeAuthenticationService())
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('exchangeCuratoriumToken_acceptsValidTokenAndReturnsApolloJwt', async () => {
    const claims = buildInnerClaims()

    const result = await service.exchangeCuratoriumToken(signInnerJwt(claims))

    expect(result).toHaveProperty('token')
    const decoded = decode(result.token)
    expect(decoded.email).toBe(claims.email)
    expect(decoded.role).toBe('user')
    expect(decoded.id).toBe(userModel.docs[0]?.id)
    // No iss=curatorium-backend - Apollo mints, not curatorium
    expect(decoded.iss).not.toBe('curatorium-backend')
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

  it('exchangeCuratoriumToken_rejectsTamperedPayload', async () => {
    // Mint a valid HS256 token with role: 'user'
    const claims = buildInnerClaims({ role: 'user' })
    const validToken = signInnerJwt(claims)

    // Split, tamper the payload's role claim to 'admin', keep original signature
    const [headerB64, payloadB64, sigB64] = validToken.split('.')
    if (!headerB64 || !payloadB64 || !sigB64) {
      throw new Error('signInnerJwt did not return a three-part token')
    }
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    )
    payload.role = 'admin'
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload))
      .toString('base64url')
      .replace(/=+$/, '')
    const tamperedToken = `${headerB64}.${tamperedPayloadB64}.${sigB64}`

    // Apollo MUST reject - HMAC over the tampered payload won't match the
    // original signature.
    await expect(
      service.exchangeCuratoriumToken(tamperedToken),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('exchangeCuratoriumToken_rejectsReplayWithinWindow', async () => {
    const innerJwt = signInnerJwt(buildInnerClaims({ jti: randomUUID() }))

    await service.exchangeCuratoriumToken(innerJwt)
    await expect(
      service.exchangeCuratoriumToken(innerJwt),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('exchangeCuratoriumToken_createsUserOnFirstLogin', async () => {
    const claims = buildInnerClaims({
      role: 'user',
      id1_kid: 'kid-A',
      id1_boot_id: 'boot-X',
    })
    await service.exchangeCuratoriumToken(signInnerJwt(claims))

    expect(userModel.docs).toHaveLength(1)
    expect(userModel.docs[0]).toMatchObject({
      username: claims.username,
      email: claims.email,
      role: 'user',
      lastId1Kid: 'kid-A',
      lastId1BootId: 'boot-X',
    })
  })

  it('exchangeCuratoriumToken_doesNotResyncRoleWhenKidAndBootIdMatch', async () => {
    await userModel.create({ username: USERNAME, email: EMAIL, role: 'user' })
    Object.assign(userModel.docs[0] ?? {}, {
      lastId1Kid: 'kid-1',
      lastId1BootId: 'boot-1',
    })

    // The claim says admin, but kid and boot id are unchanged, so the stored
    // role stays as it was.
    const result = await service.exchangeCuratoriumToken(
      signInnerJwt(
        buildInnerClaims({
          role: 'admin',
          id1_kid: 'kid-1',
          id1_boot_id: 'boot-1',
        }),
      ),
    )

    expect(userModel.docs).toHaveLength(1)
    expect(userModel.docs[0]?.role).toBe('user')
    expect(decode(result.token).role).toBe('user')
  })

  it.each([
    ['kid changes', 'admin', 'kid-NEW', 'boot-1'],
    ['boot id changes', 'readOnly', 'kid-1', 'boot-NEW'],
  ])(
    'exchangeCuratoriumToken_resyncsRoleWhen %s',
    async (_name, role, kid, bootId) => {
      await userModel.create({ username: USERNAME, email: EMAIL, role: 'user' })
      Object.assign(userModel.docs[0] ?? {}, {
        lastId1Kid: 'kid-1',
        lastId1BootId: 'boot-1',
      })

      const result = await service.exchangeCuratoriumToken(
        signInnerJwt(
          buildInnerClaims({ role, id1_kid: kid, id1_boot_id: bootId }),
        ),
      )

      expect(userModel.docs).toHaveLength(1)
      expect(userModel.docs[0]).toMatchObject({
        role,
        lastId1Kid: kid,
        lastId1BootId: bootId,
      })
      expect(decode(result.token).role).toBe(role)
    },
  )

  describe.each([['superuser'], ['none']])('rejects role=%s', (badRole) => {
    it(`rejects role=${badRole} with UnauthorizedException`, async () => {
      const claims = buildInnerClaims({ role: badRole })
      const innerJwt = signInnerJwt(claims)
      await expect(
        service.exchangeCuratoriumToken(innerJwt),
      ).rejects.toBeInstanceOf(UnauthorizedException)
      expect(userModel.docs).toHaveLength(0)
    })
  })

  it('exchangeCuratoriumToken_handlesRoleDemotion', async () => {
    await userModel.create({ username: USERNAME, email: EMAIL, role: 'admin' })
    Object.assign(userModel.docs[0] ?? {}, {
      lastId1Kid: 'k1',
      lastId1BootId: 'b1',
    })

    const result = await service.exchangeCuratoriumToken(
      signInnerJwt(
        buildInnerClaims({ role: 'user', id1_kid: 'k2', id1_boot_id: 'b1' }),
      ),
    )

    expect(userModel.docs[0]).toMatchObject({
      role: 'user',
      lastId1Kid: 'k2',
      lastId1BootId: 'b1',
    })
    expect(decode(result.token).role).toBe('user')
  })

  it('exchangeCuratoriumToken_doesNotApplyFirstUserAdminFallback', async () => {
    // Empty users collection - what would normally trigger logIn's
    // first-user-becomes-admin fallback
    expect(userModel.docs).toHaveLength(0)

    const result = await service.exchangeCuratoriumToken(
      signInnerJwt(buildInnerClaims({ role: 'user' })),
    )

    expect(userModel.docs[0]?.role).toBe('user')
    expect(userModel.docs[0]?.role).not.toBe(Role.Admin)
    expect(decode(result.token).role).toBe('user')
  })
})
