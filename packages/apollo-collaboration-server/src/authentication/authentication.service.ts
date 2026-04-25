/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from 'node:fs/promises'

import type { JWTPayload } from '@apollo-annotation/shared'
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import type { Profile as GoogleProfile } from 'passport-google-oauth20'

import { CreateUserDto } from '../users/dto/create-user.dto.js'
import { UsersService } from '../users/users.service.js'
import {
  GUEST_USER_EMAIL,
  GUEST_USER_NAME,
  ROOT_USER_EMAIL,
} from '../utils/constants.js'
import { Role } from '../utils/role/role.enum.js'
import type { Profile as MicrosoftProfile } from '../utils/strategies/microsoft.strategy.js'

export interface RequestWithUserToken extends Request {
  user: { token: string }
}

interface ConfigValues {
  MICROSOFT_CLIENT_ID?: string
  MICROSOFT_CLIENT_ID_FILE?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_ID_FILE?: string
  ALLOW_GUEST_USER: boolean
  DEFAULT_NEW_USER_ROLE: Role
  ROOT_USER_PASSWORD: string
  CURATORIUM_EXCHANGE_SECRET: string
}

const ALLOWED_EXCHANGE_ROLES: ReadonlySet<Role> = new Set([
  Role.Admin,
  Role.User,
  Role.ReadOnly,
])
const REPLAY_TTL_MS = 120_000
const REPLAY_CAPACITY = 1000
const CLOCK_TOLERANCE_SECONDS = 5

interface InnerJwtPayload {
  username: string
  email: string
  role: string
  id1_kid: string
  id1_boot_id: string
  jti: string
  iat: number
  exp: number
}

const ROOT_USER_NAME = 'root'

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name)
  private defaultNewUserRole: Role

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<ConfigValues, true>,
  ) {
    this.defaultNewUserRole = configService.get('DEFAULT_NEW_USER_ROLE', {
      infer: true,
    })
  }

  handleRedirect(req: RequestWithUserToken) {
    if (!req.user) {
      throw new BadRequestException()
    }

    const { redirect_uri } = (
      req.authInfo as { state: { redirect_uri: string } }
    ).state
    const url = new URL(redirect_uri)
    const searchParams = new URLSearchParams({ access_token: req.user.token })
    url.search = searchParams.toString()
    return { url: url.toString() }
  }

  async getLoginTypes() {
    const loginTypes: string[] = []
    let microsoftClientID = this.configService.get('MICROSOFT_CLIENT_ID', {
      infer: true,
    })
    if (!microsoftClientID) {
      const clientIDFile = this.configService.get('MICROSOFT_CLIENT_ID_FILE', {
        infer: true,
      })
      microsoftClientID =
        clientIDFile && (await fs.readFile(clientIDFile, 'utf8'))
      microsoftClientID = clientIDFile?.trim()
    }
    let googleClientID = this.configService.get('GOOGLE_CLIENT_ID', {
      infer: true,
    })
    if (!googleClientID) {
      const clientIDFile = this.configService.get('GOOGLE_CLIENT_ID_FILE', {
        infer: true,
      })
      googleClientID = clientIDFile && (await fs.readFile(clientIDFile, 'utf8'))
      googleClientID = clientIDFile?.trim()
    }
    const allowGuestUser = this.configService.get('ALLOW_GUEST_USER', {
      infer: true,
    })
    if (microsoftClientID) {
      loginTypes.push('microsoft')
    }
    if (googleClientID) {
      loginTypes.push('google')
    }
    if (allowGuestUser) {
      loginTypes.push('guest')
    }
    return loginTypes
  }

  /**
   * Log in with google
   * @param profile - profile
   * @returns Return either token with HttpResponse status 'HttpStatus.OK' OR null with 'HttpStatus.UNAUTHORIZED'
   */
  async googleLogin(profile: GoogleProfile) {
    if (!profile._json.email) {
      throw new UnauthorizedException('No email provided')
    }
    const { email, name } = profile._json
    return this.logIn(name ?? 'N/A', email)
  }

  /**
   * Log in with microsoft
   * @param profile - profile
   * @returns Return either token with HttpResponse status 'HttpStatus.OK' OR null with 'HttpStatus.UNAUTHORIZED'
   */
  async microsoftLogin(profile: MicrosoftProfile) {
    const [email] = profile.emails
    if (!email) {
      throw new UnauthorizedException('No email provided')
    }
    const { displayName } = profile
    return this.logIn(displayName, email.value)
  }

  /**
   * Log in as a guest
   * @returns Return either token with HttpResponse status 'HttpStatus.OK' OR null with 'HttpStatus.UNAUTHORIZED'
   */
  async guestLogin() {
    const allowGuestUser = this.configService.get('ALLOW_GUEST_USER', {
      infer: true,
    })
    if (allowGuestUser) {
      return this.logIn(GUEST_USER_NAME, GUEST_USER_EMAIL)
    }
    throw new UnauthorizedException('Guest users are not allowed')
  }

  async rootLogin(password: string) {
    if (password === this.configService.get('ROOT_USER_PASSWORD')) {
      return this.logIn(ROOT_USER_NAME, ROOT_USER_EMAIL)
    }
    throw new UnauthorizedException('Invalid password for ROOT user')
  }

  /**
   * Log in
   * @param name - User's display name
   * @param email - User's email
   * @returns Return token with HttpResponse status 'HttpStatus.OK'
   */
  async logIn(name: string, email: string) {
    // Find user from Mongo
    let user = await this.usersService.findByEmail(email)
    if (!user) {
      let newUserRole = this.defaultNewUserRole
      const isRootUser = name === ROOT_USER_NAME && email === ROOT_USER_EMAIL
      if (isRootUser) {
        newUserRole = Role.Admin
      } else {
        const users = await this.usersService.findAll()
        const hasAdmin = users.some(
          (user) =>
            user.role === Role.Admin &&
            user.email !== 'root_user' &&
            user.email !== 'guest_user',
        )
        // If there is not a non-guest and non-root user yet, the 1st user to
        // log in will be made an admin
        newUserRole = hasAdmin ? this.defaultNewUserRole : Role.Admin
      }
      const newUser: CreateUserDto = {
        email,
        username: name,
        role: newUserRole,
      }
      this.logger.log(
        `First time login for "${newUser.username}" (${newUser.email})`,
      )
      user = await this.usersService.addNew(newUser)
    }
    this.logger.debug(`User found in Mongo: ${JSON.stringify(user)}`)
    return this.mintTokenForUser({
      username: user.username,
      email: user.email,
      role: user.role as Role,
      id: user.id as string,
    })
  }

  private mintTokenForUser(
    user: { username: string; email: string; role: Role; id: string },
    opts?: { expSeconds?: number },
  ) {
    const payload: JWTPayload = {
      username: user.username,
      email: user.email,
      role: user.role,
      id: user.id,
    }
    const signOptions =
      opts?.expSeconds == null ? {} : { expiresIn: opts.expSeconds }
    const returnToken = this.jwtService.sign(payload, signOptions)
    this.logger.debug(`User "${user.username}" has logged in`)
    return { token: returnToken }
  }

  private readonly seenJtis = new Map<string, number>()

  /**
   * Exchange a curatorium-backend-signed HS256 JWT for an Apollo-minted
   * HS256 JWT. The inner JWT carries ORCID, role, and id1 tracking claims;
   * we honour the role verbatim (no first-user-becomes-admin fallback —
   * the role is set by curatorium-backend's CURATORIUM_APOLLO_ADMIN_ORCIDS
   * allowlist).
   */
  async exchangeCuratoriumToken(innerJwt: string) {
    const secret = this.configService.get('CURATORIUM_EXCHANGE_SECRET', {
      infer: true,
    })
    let payload: InnerJwtPayload
    try {
      payload = this.jwtService.verify<InnerJwtPayload>(innerJwt, {
        secret,
        algorithms: ['HS256'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      })
    } catch {
      throw new UnauthorizedException('Invalid exchange token')
    }

    // Replay defence: TTL purge, then size-cap (FIFO), then check + record.
    // Relies on `Map` insertion-order iteration (ES6 guarantee) for FIFO:
    // oldest entry first, so we can break on the first non-expired entry.
    const now = Date.now()
    for (const [jti, storedAt] of this.seenJtis) {
      if (now - storedAt <= REPLAY_TTL_MS) {
        break
      }
      this.seenJtis.delete(jti)
    }
    if (this.seenJtis.has(payload.jti)) {
      throw new UnauthorizedException('Token replay')
    }
    while (this.seenJtis.size >= REPLAY_CAPACITY) {
      // Narrow Map.keys().next().value (typed as `any` under tseslint's
      // strict-type-checked) to string | undefined so the delete below
      // doesn't trip `no-unsafe-argument`.
      const oldest: string | undefined = this.seenJtis.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.seenJtis.delete(oldest)
    }
    this.seenJtis.set(payload.jti, now)

    if (!ALLOWED_EXCHANGE_ROLES.has(payload.role as Role)) {
      throw new UnauthorizedException(`Unknown role: ${payload.role}`)
    }
    const role = payload.role as Role

    let user = await this.usersService.findByEmail(payload.email)
    if (user) {
      const shouldResync =
        user.lastId1Kid !== payload.id1_kid ||
        user.lastId1BootId !== payload.id1_boot_id
      if (shouldResync) {
        const updated = await this.usersService.updateRoleAndTracking(
          user.id as string,
          role,
          payload.id1_kid,
          payload.id1_boot_id,
        )
        if (updated) {
          user = updated
        }
      }
    } else {
      // Race: two concurrent token-exchange calls for a not-yet-created
      // user both reach this branch. Catch the duplicate-key error from
      // the loser and refetch — the winner has just created the row.
      try {
        user = await this.usersService.addNew({
          username: payload.username,
          email: payload.email,
          role,
        })
      } catch (e: unknown) {
        const code = (e as { code?: number } | null)?.code
        if (code === 11000) {
          user = await this.usersService.findByEmail(payload.email)
          if (!user) throw e
        } else {
          throw e
        }
      }
      await this.usersService.updateRoleAndTracking(
        user.id as string,
        role,
        payload.id1_kid,
        payload.id1_boot_id,
      )
    }

    if (!user) {
      throw new UnauthorizedException('Failed to resolve user for exchange')
    }

    const expSeconds = Math.max(1, payload.exp - Math.floor(Date.now() / 1000))
    return this.mintTokenForUser(
      {
        username: user.username,
        email: user.email,
        role: user.role as Role,
        id: user.id as string,
      },
      { expSeconds },
    )
  }
}
