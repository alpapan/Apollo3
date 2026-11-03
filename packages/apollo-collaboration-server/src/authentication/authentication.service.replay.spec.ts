import { UnauthorizedException } from '@nestjs/common'

import {
  buildInnerClaims,
  makeAuthenticationService,
  signInnerJwt,
} from './authentication.test-support.js'

// Larger than the replay record's capacity, so a record that admits
// role-rejected tokens is forced to evict earlier entries.
const MORE_THAN_REPLAY_CAPACITY = 1500

describe('AuthenticationService replay record and role rejection', () => {
  let { service } = makeAuthenticationService()

  beforeEach(() => {
    ;({ service } = makeAuthenticationService())
  })

  it('rejects a token with an unknown role for its role every time it is presented', async () => {
    const innerJwt = signInnerJwt(buildInnerClaims({ role: 'superuser' }))

    await expect(service.exchangeCuratoriumToken(innerJwt)).rejects.toThrow(
      'Unknown role: superuser',
    )
    await expect(service.exchangeCuratoriumToken(innerJwt)).rejects.toThrow(
      'Unknown role: superuser',
    )
  })

  it('keeps an accepted token in the replay record however many role-rejected tokens follow', async () => {
    const accepted = signInnerJwt(buildInnerClaims({ role: 'user' }))
    await service.exchangeCuratoriumToken(accepted)

    for (let i = 0; i < MORE_THAN_REPLAY_CAPACITY; i++) {
      await expect(
        service.exchangeCuratoriumToken(
          signInnerJwt(buildInnerClaims({ role: 'superuser' })),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException)
    }

    await expect(service.exchangeCuratoriumToken(accepted)).rejects.toThrow(
      'Token replay',
    )
  })
})
