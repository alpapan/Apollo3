import { readdir } from 'node:fs/promises'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { PluginsModule } from './plugins.module.js'

// fetchPlugins writes each plugin beside plugins.module under a
// jbrowse-plugin-<random> directory; ts-jest resolves that to this directory.
const pluginsDir = path.resolve('src', 'plugins')

const PLUGIN_SOURCES: Record<string, string> = {
  '/ok.js': 'export default class OkPlugin {}\n',
  // Removes the directory it was loaded from, then fails: the cleanup of that
  // directory has nothing left to remove, and the load error must still surface.
  '/self-removing-failure.js': [
    "import { rmSync } from 'node:fs'",
    "import { dirname } from 'node:path'",
    "import { fileURLToPath } from 'node:url'",
    'rmSync(dirname(fileURLToPath(import.meta.url)), { recursive: true })',
    "throw new Error('plugin load failed')",
    '',
  ].join('\n'),
}

async function leftoverPluginDirs() {
  const entries = await readdir(pluginsDir)
  return entries.filter((entry) => entry.startsWith('jbrowse-plugin-'))
}

describe('PluginsModule.fetchPlugins', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      const source = PLUGIN_SOURCES[req.url ?? '']
      if (source === undefined) {
        res.statusCode = 404
        res.end()
        return
      }
      res.setHeader('Content-Type', 'text/javascript')
      res.end(source)
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  })

  it('loads a plugin and removes its temporary directory', async () => {
    const plugins = await PluginsModule.fetchPlugins([`${baseUrl}/ok.js`])

    expect(plugins).toHaveLength(1)
    expect(await leftoverPluginDirs()).toEqual([])
  })

  it('reports the plugin load error even when the temporary directory is already gone', async () => {
    await expect(
      PluginsModule.fetchPlugins([`${baseUrl}/self-removing-failure.js`]),
    ).rejects.toThrow('plugin load failed')

    expect(await leftoverPluginDirs()).toEqual([])
  })
})
