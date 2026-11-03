import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { gunzipSync } from 'node:zlib'

import { Logger } from '@nestjs/common'

import { writeFileAndCalculateHash } from './filesUtil.js'

const HELLO = Buffer.from('hello')
const HELLO_MD5 = '5d41402abc4b2a76b9719d911017c592'

// Yields one chunk, then fails (or closes without ending) on the next read, so
// the failure lands after the consumer has attached its listeners.
function failingStream(error?: Error) {
  let reads = 0
  return new Readable({
    read() {
      if (reads++ === 0) {
        this.push(HELLO)
      } else {
        this.destroy(error)
      }
    },
  })
}

describe('writeFileAndCalculateHash', () => {
  let uploadFolder: string
  const logger = new Logger('filesUtil.spec')

  beforeAll(() => {
    Logger.overrideLogger(false)
  })

  beforeEach(async () => {
    uploadFolder = await mkdtemp(path.join(tmpdir(), 'apollo-files-util-'))
  })

  afterEach(async () => {
    await rm(uploadFolder, { recursive: true, force: true })
  })

  it('stores the gzipped upload under its md5 and leaves no temporary directory', async () => {
    const checksum = await writeFileAndCalculateHash(
      {
        originalname: 'hello.txt',
        size: HELLO.length,
        stream: Readable.from([HELLO]),
      },
      uploadFolder,
      logger,
    )

    expect(checksum).toBe(HELLO_MD5)
    expect(await readdir(uploadFolder)).toEqual([HELLO_MD5])
    const stored = await readFile(path.join(uploadFolder, HELLO_MD5))
    expect(gunzipSync(stored).toString()).toBe('hello')
  })

  it.each([
    {
      name: 'a stream error while gzipping',
      contentEncoding: undefined,
      error: new Error('upload stream failed'),
      expected: 'upload stream failed',
    },
    {
      name: 'a stream error with a pre-gzipped body',
      contentEncoding: 'gzip',
      error: new Error('upload stream failed'),
      expected: 'upload stream failed',
    },
    {
      name: 'an aborted upload (stream closed without ending)',
      contentEncoding: undefined,
      error: undefined,
      expected: 'Premature close',
    },
  ])(
    'removes the temporary directory and partial file after $name',
    async ({ contentEncoding, error, expected }) => {
      await expect(
        writeFileAndCalculateHash(
          {
            originalname: 'partial.txt',
            size: 1000,
            stream: failingStream(error),
            contentEncoding,
          },
          uploadFolder,
          logger,
        ),
      ).rejects.toThrow(expected)

      expect(await readdir(uploadFolder)).toEqual([])
    },
  )

  it('removes the temporary directory when moving the file into place fails', async () => {
    // A non-empty directory already occupying the final name makes rename fail.
    const occupied = path.join(uploadFolder, HELLO_MD5)
    await mkdir(occupied)
    await writeFile(path.join(occupied, 'keep'), 'keep')

    await expect(
      writeFileAndCalculateHash(
        {
          originalname: 'hello.txt',
          size: HELLO.length,
          stream: Readable.from([HELLO]),
        },
        uploadFolder,
        logger,
      ),
    ).rejects.toThrow()

    expect(await readdir(uploadFolder)).toEqual([HELLO_MD5])
    expect(await readdir(occupied)).toEqual(['keep'])
  })
})
