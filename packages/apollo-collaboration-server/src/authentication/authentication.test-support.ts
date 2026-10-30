import { randomUUID } from 'node:crypto'

import type { UserDocument } from '@apollo-annotation/schemas'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import jwt from 'jsonwebtoken'
import type { Model } from 'mongoose'

import { MessagesGateway } from '../messages/messages.gateway.js'
import { PluginsService } from '../plugins/plugins.service.js'
import { UsersService } from '../users/users.service.js'
import { Role } from '../utils/role/role.enum.js'

import { AuthenticationService } from './authentication.service.js'

export const TEST_EXCHANGE_SECRET = 'a'.repeat(64)
export const TEST_APOLLO_JWT_SECRET = 'b'.repeat(64)

export interface StoredUser {
  id: string
  username: string
  email: string
  role: string
  lastId1Kid?: string
  lastId1BootId?: string
}

/**
 * Stands in for the Mongoose user model, the database boundary. It supports
 * only the model calls that UsersService makes on the token-exchange path.
 */
export class InMemoryUserModel {
  readonly docs: StoredUser[] = []
  private nextId = 1

  findOne(filter: { email: string }) {
    return {
      exec: () =>
        Promise.resolve(
          this.docs.find((doc) => doc.email === filter.email) ?? null,
        ),
    }
  }

  find() {
    return { exec: () => Promise.resolve([...this.docs]) }
  }

  create(dto: { username: string; email: string; role: string }) {
    const doc: StoredUser = { ...dto, id: `mongo-id-${this.nextId++}` }
    this.docs.push(doc)
    return Promise.resolve(doc)
  }

  findByIdAndUpdate(id: string, update: Partial<StoredUser>) {
    return {
      exec: () => {
        const doc = this.docs.find((d) => d.id === id)
        if (doc) {
          Object.assign(doc, update)
        }
        return Promise.resolve(doc ?? null)
      },
    }
  }
}

export interface InnerClaimsOverride {
  username?: string
  email?: string
  role?: string
  id1_kid?: string
  id1_boot_id?: string
  jti?: string
  expSeconds?: number
}

export function buildInnerClaims(overrides: InnerClaimsOverride = {}) {
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

export function signInnerJwt(claims: object, secret = TEST_EXCHANGE_SECRET) {
  return jwt.sign(claims, secret, { algorithm: 'HS256' })
}

/**
 * Builds the real AuthenticationService over the real UsersService, JwtService,
 * ConfigService, MessagesGateway and PluginsService. Only the user model is
 * replaced.
 */
export function makeAuthenticationService(
  extraConfig: Record<string, unknown> = {},
) {
  const userModel = new InMemoryUserModel()
  const configService = new ConfigService({
    CURATORIUM_EXCHANGE_SECRET: TEST_EXCHANGE_SECRET,
    DEFAULT_NEW_USER_ROLE: Role.User,
    ...extraConfig,
  })
  const usersService = new UsersService(
    userModel as unknown as Model<UserDocument>,
    new MessagesGateway(),
    configService as never,
  )
  const jwtService = new JwtService({
    secret: TEST_APOLLO_JWT_SECRET,
    signOptions: { algorithm: 'HS256' },
  })
  const service = new AuthenticationService(
    usersService,
    jwtService,
    configService as never,
    new PluginsService([]),
  )
  return { service, userModel }
}
