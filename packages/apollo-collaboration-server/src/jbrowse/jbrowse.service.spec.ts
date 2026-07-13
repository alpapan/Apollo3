import { jest } from '@jest/globals'

// Break the pre-existing AssembliesService -> ChecksService -> SequenceService
// -> AssembliesService circular import chain that pulls sequence.service.ts
// into the module-load graph at import time. None of these services are
// exercised by the assertions in this spec (getPlugins only reads ConfigService).
// ESM jest.mock() is not hoisted, so unstable_mockModule + dynamic import is
// the correct mechanism in this Jest config (useESM: true).
jest.unstable_mockModule('../assemblies/assemblies.service.js', () => ({
  AssembliesService: class AssembliesService {
    readonly placeholder = true
  },
}))
jest.unstable_mockModule('../checks/checks.service.js', () => ({
  ChecksService: class ChecksService {
    readonly placeholder = true
  },
}))
jest.unstable_mockModule('../features/features.service.js', () => ({
  FeaturesService: class FeaturesService {
    readonly placeholder = true
  },
}))
jest.unstable_mockModule('../refSeqs/refSeqs.service.js', () => ({
  RefSeqsService: class RefSeqsService {
    readonly placeholder = true
  },
}))

// Must come after the mock registrations so the mocks apply.
const { JBrowseService } = await import('./jbrowse.service.js')

// Direct instantiation: avoids Nest's Test module + breaks the dependency on
// pulling in the Mongoose model token that the spec never exercises.
// getPlugins() reads only ConfigService, so the other three slots are inert.
function makeService(configGet: (key: string) => unknown = () => undefined) {
  return new JBrowseService(
    {} as never,
    {} as never,
    {} as never,
    { get: configGet } as never,
  )
}

describe('JBrowseService', () => {
  it('should be defined', () => {
    expect(makeService()).toBeDefined()
  })

  it('getPlugins returns Apollo and Primer3Plugin entries with stable URLs', () => {
    const plugins = makeService().getPlugins()
    // Assert both name AND url literals so a future change swapping the
    // primer3 URL to an attacker origin (or dropping the entry entirely)
    // cannot pass this test silently. The col-server's
    // /apollo/jbrowse/config.json ships whatever this method returns.
    expect(plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Apollo' }),
        expect.objectContaining({
          name: 'Primer3Plugin',
          url: '/jbrowse-plugins/primer3.umd.js',
        }),
      ]),
    )
  })
})
