import { randomUUID } from 'node:crypto'

import {
  buildInnerClaims,
  makeAuthenticationService,
  signInnerJwt,
} from './authentication.test-support.js'

const PURGE_EMAIL = '0000-0001-0000-0001@apollo.curatorium.local'
const OTHER_EMAIL = '0000-0001-0000-0002@apollo.curatorium.local'
const WRONG_SECRET = 'c'.repeat(64)

function buildPurgeClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = {
    purpose: 'purge',
    email: PURGE_EMAIL,
    jti: randomUUID(),
    iat: now,
    exp: now + 60,
    ...overrides,
  }
  return Object.fromEntries(
    Object.entries(claims).filter(([, value]) => value !== undefined),
  )
}

const REFUSALS: [string, () => string, string][] = [
  [
    'a token signed with another secret',
    () => signInnerJwt(buildPurgeClaims(), WRONG_SECRET),
    'Invalid purge token',
  ],
  [
    'an expired token',
    () => {
      const now = Math.floor(Date.now() / 1000)
      return signInnerJwt(buildPurgeClaims({ iat: now - 120, exp: now - 60 }))
    },
    'Invalid purge token',
  ],
  [
    'a token with no purpose',
    () => signInnerJwt(buildPurgeClaims({ purpose: undefined })),
    'Invalid purge token',
  ],
  [
    'a token with another purpose',
    () => signInnerJwt(buildPurgeClaims({ purpose: 'exchange' })),
    'Invalid purge token',
  ],
  [
    'a token with no jti',
    () => signInnerJwt(buildPurgeClaims({ jti: undefined })),
    'Invalid purge token',
  ],
  [
    'a token with no exp',
    () => signInnerJwt(buildPurgeClaims({ exp: undefined })),
    'Invalid purge token',
  ],
  [
    'an exchange token',
    () => signInnerJwt(buildInnerClaims({ email: PURGE_EMAIL })),
    'Invalid purge token',
  ],
  [
    'the root user',
    () => signInnerJwt(buildPurgeClaims({ email: 'root_user' })),
    'Purge refused for this email',
  ],
  [
    'the guest user',
    () => signInnerJwt(buildPurgeClaims({ email: 'guest_user' })),
    'Purge refused for this email',
  ],
  [
    'an email outside Curatorium',
    () =>
      signInnerJwt(
        buildPurgeClaims({ email: '0000-0001-0000-0001@example.org' }),
      ),
    'Purge refused for this email',
  ],
]

describe('AuthenticationService purge of a Curatorium user', () => {
  let { service, userModel } = makeAuthenticationService()

  beforeEach(() => {
    ;({ service, userModel } = makeAuthenticationService())
  })

  it('deletes the user named by a valid purge token and leaves the others', async () => {
    await userModel.create({
      username: 'apollo-0000-0001-0000-0001',
      email: PURGE_EMAIL,
      role: 'user',
    })
    await userModel.create({
      username: 'apollo-0000-0001-0000-0002',
      email: OTHER_EMAIL,
      role: 'user',
    })

    await expect(
      service.purgeCuratoriumUser(signInnerJwt(buildPurgeClaims())),
    ).resolves.toEqual({ status: 'deleted' })
    expect(userModel.docs.map((doc) => doc.email)).toEqual([OTHER_EMAIL])
  })

  it('answers absent when no user has that email', async () => {
    await expect(
      service.purgeCuratoriumUser(signInnerJwt(buildPurgeClaims())),
    ).resolves.toEqual({ status: 'absent' })
  })

  it('refuses a purge token presented a second time', async () => {
    const token = signInnerJwt(buildPurgeClaims())
    await service.purgeCuratoriumUser(token)

    await expect(service.purgeCuratoriumUser(token)).rejects.toThrow(
      'Token replay',
    )
  })

  it.each(REFUSALS)(
    'refuses %s and deletes nothing',
    async (_name, makeToken, message) => {
      await userModel.create({
        username: 'apollo-0000-0001-0000-0001',
        email: PURGE_EMAIL,
        role: 'user',
      })

      await expect(service.purgeCuratoriumUser(makeToken())).rejects.toThrow(
        message,
      )
      expect(userModel.docs.map((doc) => doc.email)).toEqual([PURGE_EMAIL])
    },
  )

  it('is refused by the exchange', async () => {
    await expect(
      service.exchangeCuratoriumToken(signInnerJwt(buildPurgeClaims())),
    ).rejects.toThrow('Unknown role: undefined')
  })
})
