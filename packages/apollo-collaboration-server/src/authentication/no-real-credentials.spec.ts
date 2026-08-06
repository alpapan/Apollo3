/**
 * No curatorium-authored file in the apollo fork carries a real credential literal.
 *
 * A secret committed to a tracked file is disclosed to everyone who can read
 * the repository and to every clone and mirror of it, and no later edit takes
 * that back: the value stays in history. Fixtures need a credential only to
 * prove the code reads one, so the value itself is never load-bearing. Test
 * values use the all-zero placeholder, which belongs to nobody and cannot
 * authenticate anywhere.
 *
 * Scope here is narrower than in every other repository, and deliberately so.
 * This package is a fork: upstream's own committed development credentials are
 * accepted as they stand, and an upstream file is never edited in a fork. So
 * the guard judges only the files this fork has authored or changed, listed
 * below. The cost of that choice is that the list is maintained by hand - a new
 * curatorium-authored file is not judged until it is added here - and the
 * canary below limits the rot by failing the moment a listed path stops
 * existing.
 *
 * Two independent rules decide a line. The first judges a secret-shaped literal
 * assigned to a name that reads as a credential; the second judges a token
 * whose own shape identifies its issuer, which is a credential whatever it is
 * called. Both are narrower than a general entropy test on purpose: a guard
 * that cries wolf gets an exclusion added to it and then guards nothing.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

// Every path this fork has authored or changed relative to upstream, filtered
// to the file kinds a credential can hide in. Regenerate with:
//   git diff --name-only $(git merge-base origin/main curatorium) curatorium
const CURATORIUM_AUTHORED_PATHS = [
  '.yarnrc.yml',
  'CLAUDE.md',
  'eslint.config.mjs',
  'package.json',
  'packages/apollo-cli/README.md',
  'packages/apollo-cli/src/utils.ts',
  'packages/apollo-collaboration-server/package.json',
  'packages/apollo-collaboration-server/src/app.module.ts',
  'packages/apollo-collaboration-server/src/authentication/authentication.controller.spec.ts',
  'packages/apollo-collaboration-server/src/authentication/authentication.controller.ts',
  'packages/apollo-collaboration-server/src/authentication/authentication.service.spec.ts',
  'packages/apollo-collaboration-server/src/authentication/authentication.service.ts',
  'packages/apollo-collaboration-server/src/jbrowse/jbrowse.service.spec.ts',
  'packages/apollo-collaboration-server/src/jbrowse/jbrowse.service.ts',
  'packages/apollo-collaboration-server/src/main.ts',
  'packages/apollo-collaboration-server/src/plugins/plugins.module.ts',
  'packages/apollo-collaboration-server/src/refSeqs/refSeqs.controller.spec.ts',
  'packages/apollo-collaboration-server/src/refSeqs/refSeqs.controller.ts',
  'packages/apollo-collaboration-server/src/refSeqs/refSeqs.module.ts',
  'packages/apollo-collaboration-server/src/refSeqs/refSeqs.service.spec.ts',
  'packages/apollo-collaboration-server/src/refSeqs/refSeqs.service.ts',
  'packages/apollo-collaboration-server/src/users/user.schema.spec.ts',
  'packages/apollo-collaboration-server/src/users/users.controller.spec.ts',
  'packages/apollo-collaboration-server/src/users/users.service.spec.ts',
  'packages/apollo-collaboration-server/src/users/users.service.ts',
  'packages/apollo-collaboration-server/src/utils/strategies/jwt.strategy.spec.ts',
  'packages/apollo-collaboration-server/src/utils/strategies/jwt.strategy.ts',
  'packages/apollo-schemas/src/user.schema.ts',
  'packages/jbrowse-plugin-apollo/src/ApolloInternetAccount/model.ts',
  'packages/jbrowse-plugin-apollo/src/util/index.ts',
  'packages/website/src/components/DemoLink/index.tsx',
  'packages/website/src/components/HomepageFeatures/index.tsx',
  'pixi.toml',
]

// A name reads as a credential when one of these words appears anywhere in it,
// so ORCID_CLIENT_SECRET, clientSecret and orcid-client-secret are one case.
// Comparison is on the lowercased name: YAML and JSON keys are conventionally
// lowercase, and a case-sensitive check passes over every one of them.
const CREDENTIAL_WORDS = [
  'secret',
  'token',
  'password',
  'passwd',
  'credential',
  'apikey',
  'api_key',
  'api-key',
  'privatekey',
  'private_key',
  'private-key',
  'accesskey',
  'access_key',
  'access-key',
  'authorization',
  'authorisation',
]

// Words too short or too common to be substrings. They count only as a whole
// name, so `pw` is judged and `PRIMARY_KEY` and `AUTHOR` are not.
const BARE_CREDENTIAL_NAMES = new Set(['pw', 'pwd', 'pass', 'key', 'auth'])

const ASSIGNMENT =
  /["']?(?<name>[A-Za-z_][A-Za-z0-9_.-]*)["']?\s*(?::=|[:=])\s*["']?(?<value>[^\s"',;}\])]+)/g

const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const HEX_TOKEN = /^[0-9a-fA-F]{32,}$/

// A long unbroken base64 run is how a randomly generated key of 32 bytes or
// more is written down. Length alone is not the test: a written-out English
// placeholder reaches 60 characters just as easily, and judging it would make
// the guard cry wolf. Generated material also mixes character classes, and a
// phrase a human typed does not, so both conditions must hold.
const BASE64_TOKEN = /^[A-Za-z0-9+/]{40,}={0,2}$/
const HAS_LOWER = /[a-z]/
const HAS_UPPER = /[A-Z]/
const HAS_DIGIT = /[0-9]/

const JWT = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/

// Issuer-prefixed tokens. The prefix is assigned by the issuing service, so a
// value carrying one is a real credential regardless of the name it is bound to
// and regardless of whether it is bound to a name at all. Each branch requires
// the token body length: without it, prose that merely names a prefix is
// reported, and every document discussing this guard becomes a failure.
const PROVIDER_TOKEN_BODY =
  String.raw`gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}` +
  String.raw`|sk-proj-[A-Za-z0-9_-]{32,}|sk-[A-Za-z0-9]{32,}|sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}` +
  String.raw`|GOCSPX-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ya29\.[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}` +
  String.raw`|glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{30,}|dop_v1_[a-f0-9]{40,}|shpat_[a-f0-9]{32}`
const PROVIDER_TOKEN = new RegExp(`(?:${PROVIDER_TOKEN_BODY})`)
const PROVIDER_TOKEN_ANCHORED = new RegExp(`^(?:${PROVIDER_TOKEN_BODY})`)

// A PEM private key block whose body carries real key material. The body is
// read across escaped newlines as well as real ones, because a single-line
// string is how a key most often reaches a fixture.
const PEM_PRIVATE_KEY =
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----([\s\S]*?)-----END/g
const PEM_BODY_MATERIAL = /[A-Za-z0-9+/]+/g

// Total base64 content, not the longest run: a real key is wrapped at 64
// columns, so run length says nothing about it. An RSA-2048 body is about 1600
// characters and the smallest useful EC key about 200, while a truncated
// fixture is a few dozen.
const PEM_MINIMUM_KEY_MATERIAL = 200

/**
 * The fork root, found by walking up for the two files only it carries. Anchor
 * on markers rather than on a relative hop so the guard survives being run from
 * the package directory, the fork root, or anywhere between.
 */
function forkRoot(): string {
  let directory = process.cwd()
  for (;;) {
    if (
      existsSync(path.join(directory, 'pixi.toml')) &&
      existsSync(path.join(directory, '.yarnrc.yml'))
    ) {
      return directory
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error('no apollo fork root above the working directory')
    }
    directory = parent
  }
}

function isCredentialName(name: string): boolean {
  const lowered = name.toLowerCase()
  if (BARE_CREDENTIAL_NAMES.has(lowered)) {
    return true
  }
  return CREDENTIAL_WORDS.some((word) => lowered.includes(word))
}

function looksGenerated(value: string): boolean {
  return HAS_LOWER.test(value) && HAS_UPPER.test(value) && HAS_DIGIT.test(value)
}

function isSecretShaped(value: string): boolean {
  if (value === PLACEHOLDER) {
    return false
  }
  if (UUID.test(value) || HEX_TOKEN.test(value)) {
    return true
  }
  if (BASE64_TOKEN.test(value) && looksGenerated(value)) {
    return true
  }
  return PROVIDER_TOKEN_ANCHORED.test(value) || JWT.test(value)
}

/** Whether one line carries a credential, by either of the two rules. */
function lineOffends(line: string): boolean {
  if (PROVIDER_TOKEN.test(line)) {
    return true
  }
  for (const match of line.matchAll(ASSIGNMENT)) {
    const groups = match.groups as { name: string; value: string }
    if (isCredentialName(groups.name) && isSecretShaped(groups.value)) {
      return true
    }
  }
  return false
}

/** Whether a file's whole text carries a PEM private key with real material. */
function textOffendsWithPem(text: string): boolean {
  for (const match of text.matchAll(PEM_PRIVATE_KEY)) {
    const body = match[1] ?? ''
    let material = 0
    for (const run of body.matchAll(PEM_BODY_MATERIAL)) {
      material += run[0].length
    }
    if (material >= PEM_MINIMUM_KEY_MATERIAL) {
      return true
    }
  }
  return false
}

describe('no real credentials in curatorium-authored files', () => {
  it('reports no credential-shaped literal in any curatorium-authored file', () => {
    const root = forkRoot()
    const offenders: string[] = []
    for (const relative of CURATORIUM_AUTHORED_PATHS) {
      const absolute = path.resolve(root, relative)
      if (!existsSync(absolute)) {
        continue
      }
      const text = readFileSync(absolute, 'utf8')
      const lines = text.split('\n')
      for (const [index, line] of lines.entries()) {
        if (lineOffends(line)) {
          offenders.push(`${relative}:${index + 1}`)
        }
      }
      if (textOffendsWithPem(text)) {
        offenders.push(`${relative}: PEM private key with real material`)
      }
    }
    // Offending lines are named without their values, deliberately.
    expect(offenders).toEqual([])
  })

  it('still points at files that exist', () => {
    // Canary. A renamed or deleted path would silently shrink the scan, and a
    // scan that reaches nothing passes without judging anything.
    const root = forkRoot()
    const missing = CURATORIUM_AUTHORED_PATHS.filter(
      (relative) => !existsSync(path.resolve(root, relative)),
    )
    expect(missing).toEqual([])
    expect(CURATORIUM_AUTHORED_PATHS.length).toBeGreaterThan(20)
    for (const relative of CURATORIUM_AUTHORED_PATHS) {
      expect(statSync(path.resolve(root, relative)).isFile()).toBe(true)
    }
    // Coverage is not one package only, and not one file kind only. Either
    // narrowing is the way a scan goes blind while still listing many paths.
    const suffixes = new Set(
      CURATORIUM_AUTHORED_PATHS.map((relative) => path.extname(relative)),
    )
    for (const needed of ['.ts', '.md', '.json']) {
      expect([...suffixes]).toContain(needed)
    }
    const packages = new Set(
      CURATORIUM_AUTHORED_PATHS.filter((relative) =>
        relative.startsWith('packages/'),
      ).map((relative) => relative.split('/')[1]),
    )
    expect(packages.size).toBeGreaterThan(1)
  })

  it('admits and rejects the sample lines it claims to', () => {
    // Both directions, pinned together. Without the rejected cases this guard
    // could pass by matching nothing at all, which is exactly how the
    // disclosure it exists to stop went unnoticed. Every admitted case must be
    // admitted for a stated reason, not because the pattern never looked at it.
    const real = 'ff62a1de-4f1c-4d2b-9f7e-2b8c1a0d5e33'
    const admitted = [
      `ORCID_CLIENT_SECRET="${PLACEHOLDER}"`,
      `        orcid-client-secret: ${PLACEHOLDER}`,
      `{"ORCID_CLIENT_SECRET": "${PLACEHOLDER}"}`,
      'ORCID_CLIENT_ID="a-client-id-is-not-a-credential"',
      `const assemblyUuid = "${real}"`,
      `PRIMARY_KEY = "${real}"`,
      `AUTHOR = "${real}"`,
      // An issuer prefix named in prose is not a token. Requiring the body
      // length is what separates the two.
      'prose naming the ghp_ prefix, or AKIA, carries no token',
    ]
    for (const line of admitted) {
      expect([line, lineOffends(line)]).toEqual([line, false])
    }

    const rejected = [
      `CURATORIUM_APOLLO_JWT_SECRET="${real}"`,
      `ORCID_CLIENT_SECRET: ${real}`,
      `        orcid-client-secret: ${real}`,
      `nextcloud_app_password: ${real}`,
      `const clientSecret = "${real}"`,
      `pw = "${real}"`,
      `{"NEXTCLOUD_APP_PASSWORD": "${real}"}`,
      `export SLURM_CALLBACK_TOKEN=${real}`,
      `API_KEY = "${real}"`,
      'SECRET = "a3f9c2e81b7d45069af3c2e8b1d7405963fa2c1e"',
      'API_TOKEN = "ghp_16C7e42F292c6912E7710c838347Ae178B4a"',
      'API_KEY = "AKIAIOSFODNN7EXAMPLE"',
      'TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.aBcDeFgHiJkLmNoPqRsTuVwXyZ01234"',
      'aBareNameButAnIssuerPrefixedToken = ghp_16C7e42F292c6912E7710c838347Ae178B4a',
    ]
    for (const line of rejected) {
      expect([line, lineOffends(line)]).toEqual([line, true])
    }
  })

  it('admits a placeholder PEM and rejects one carrying real material', () => {
    const placeholder =
      '-----BEGIN PRIVATE KEY-----\nunit-test\n-----END PRIVATE KEY-----\n'
    expect(textOffendsWithPem(placeholder)).toBe(false)

    const material =
      'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDe'.repeat(8)
    const key = `-----BEGIN RSA PRIVATE KEY-----\n${material}\n-----END RSA PRIVATE KEY-----\n`
    expect(textOffendsWithPem(key)).toBe(true)
    expect(textOffendsWithPem(key.replaceAll('\n', String.raw`\n`))).toBe(true)

    // A real key is wrapped at 64 columns, so no single run reaches the
    // threshold; only the total does.
    const wrapped = (material.match(/.{1,64}/g) ?? []).join('\n')
    expect(
      textOffendsWithPem(
        `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`,
      ),
    ).toBe(true)
  })
})
