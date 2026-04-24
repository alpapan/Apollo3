/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ConfigService } from '@nestjs/config'
import jwt from 'jsonwebtoken'

import { JwtStrategy } from './jwt.strategy.js'

const SECRET = 'phase-1-5-test-secret-long-enough-for-hs256'
const VALID_AUD = 'apollo-collaboration-server'
const VALID_ISS = 'curatorium-backend'

/**
 * Minimal ConfigService mock. Returns whatever override values we give it.
 * The real Strategy reads JWT_SECRET (required), and will read JWT_AUDIENCE /
 * JWT_ISSUER after the Part A hardening lands.
 */
function makeConfigService(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    JWT_SECRET: SECRET,
    JWT_AUDIENCE: VALID_AUD,
    JWT_ISSUER: VALID_ISS,
    ...overrides,
  }
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService<
    { JWT_SECRET: string; JWT_AUDIENCE?: string; JWT_ISSUER?: string },
    true
  >
}

/**
 * Drive passport-jwt Strategy end-to-end against a synthetic request.
 * Returns success (user) / fail (info) / error (err) — only one fires.
 */
function runStrategy(
  strategy: JwtStrategy,
  token: string,
): Promise<{ user?: unknown; fail?: unknown; error?: unknown }> {
  const req = {
    headers: { authorization: `Bearer ${token}` },
  } as any
  return new Promise((resolve) => {
    ;(strategy as any).success = (user: unknown) => resolve({ user })
    ;(strategy as any).fail = (info: unknown) => resolve({ fail: info })
    ;(strategy as any).error = (err: unknown) => resolve({ error: err })
    ;(strategy as any).authenticate(req)
  })
}

describe('JwtStrategy aud/iss enforcement (Phase 1.5 Part A)', () => {
  describe('regression guard — must pass BEFORE and AFTER the hardening', () => {
    it('accepts token with matching aud + iss', async () => {
      const strategy = new JwtStrategy(makeConfigService())
      const token = jwt.sign(
        { id: 'u1', username: 'u1', email: 'u1@x', role: 'user' },
        SECRET,
        { audience: VALID_AUD, issuer: VALID_ISS, expiresIn: '5m' },
      )
      const result = await runStrategy(strategy, token)
      expect(result.user).toBeDefined()
      expect((result.user as any).username).toBe('u1')
    })
  })

  describe('hardening — RED now, GREEN after JWT_AUDIENCE/JWT_ISSUER wired', () => {
    it('rejects token with wrong aud', async () => {
      const strategy = new JwtStrategy(makeConfigService())
      const token = jwt.sign(
        { id: 'u1', username: 'u1', email: 'u1@x', role: 'user' },
        SECRET,
        { audience: 'some-other-service', issuer: VALID_ISS, expiresIn: '5m' },
      )
      const result = await runStrategy(strategy, token)
      expect(result.fail).toBeDefined()
      expect(result.user).toBeUndefined()
    })

    it('rejects token with wrong iss', async () => {
      const strategy = new JwtStrategy(makeConfigService())
      const token = jwt.sign(
        { id: 'u1', username: 'u1', email: 'u1@x', role: 'user' },
        SECRET,
        { audience: VALID_AUD, issuer: 'some-other-issuer', expiresIn: '5m' },
      )
      const result = await runStrategy(strategy, token)
      expect(result.fail).toBeDefined()
      expect(result.user).toBeUndefined()
    })

    it('rejects token with missing aud when JWT_AUDIENCE is configured', async () => {
      const strategy = new JwtStrategy(makeConfigService())
      const token = jwt.sign(
        { id: 'u1', username: 'u1', email: 'u1@x', role: 'user' },
        SECRET,
        { issuer: VALID_ISS, expiresIn: '5m' }, // no audience
      )
      const result = await runStrategy(strategy, token)
      expect(result.fail).toBeDefined()
      expect(result.user).toBeUndefined()
    })

    it('rejects token with missing iss when JWT_ISSUER is configured', async () => {
      const strategy = new JwtStrategy(makeConfigService())
      const token = jwt.sign(
        { id: 'u1', username: 'u1', email: 'u1@x', role: 'user' },
        SECRET,
        { audience: VALID_AUD, expiresIn: '5m' }, // no issuer
      )
      const result = await runStrategy(strategy, token)
      expect(result.fail).toBeDefined()
      expect(result.user).toBeUndefined()
    })
  })

  describe('backward compatibility — JWT_AUDIENCE/JWT_ISSUER unset (upstream default)', () => {
    it('accepts token with no aud claim when JWT_AUDIENCE is unset', async () => {
      const strategy = new JwtStrategy(
        makeConfigService({ JWT_AUDIENCE: undefined, JWT_ISSUER: undefined }),
      )
      const token = jwt.sign(
        { id: 'u1', username: 'u1', email: 'u1@x', role: 'user' },
        SECRET,
        { expiresIn: '5m' },
      )
      const result = await runStrategy(strategy, token)
      expect(result.user).toBeDefined()
    })
  })
})
