import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { Logger } from '@nestjs/common'

import { FileStorageEngine, type FileUpload } from './FileStorageEngine.js'

function failingStream(error: Error) {
  let reads = 0
  return new Readable({
    read() {
      if (reads++ === 0) {
        this.push(Buffer.from('hello'))
      } else {
        this.destroy(error)
      }
    },
  })
}

describe('FileStorageEngine', () => {
  let uploadFolder: string
  let previousFolder: string | undefined

  beforeAll(() => {
    Logger.overrideLogger(false)
  })

  beforeEach(async () => {
    previousFolder = process.env.FILE_UPLOAD_FOLDER
    uploadFolder = await mkdtemp(path.join(tmpdir(), 'apollo-storage-engine-'))
    process.env.FILE_UPLOAD_FOLDER = uploadFolder
  })

  afterEach(async () => {
    if (previousFolder === undefined) {
      delete process.env.FILE_UPLOAD_FOLDER
    } else {
      process.env.FILE_UPLOAD_FOLDER = previousFolder
    }
    await rm(uploadFolder, { recursive: true, force: true })
  })

  it('passes a failed upload to the multer callback and leaves no temporary files', async () => {
    const engine = new FileStorageEngine()
    const uploadError = new Error('upload stream failed')
    const file = {
      originalname: 'partial.txt',
      size: 1000,
      stream: failingStream(uploadError),
    } as unknown as FileUpload

    const reported = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('multer callback was never called')),
        2000,
      )
      void engine._handleFile({} as Express.Request, file, (error) => {
        clearTimeout(timer)
        resolve(error)
      })
    })

    expect(reported).toBe(uploadError)
    expect(await readdir(uploadFolder)).toEqual([])
  })
})
