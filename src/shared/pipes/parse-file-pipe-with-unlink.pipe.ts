import { ParseFileOptions, ParseFilePipe } from '@nestjs/common'
import fs from 'fs/promises'

export class ParseFilePipeWithUnlink extends ParseFilePipe {
  constructor(options?: ParseFileOptions) {
    super(options)
  }

  async transform(files: Array<Express.Multer.File>): Promise<any> {
    return super.transform(files).catch(async (err) => {
      if (!files || files.length === 0) {
        return
      }
      await Promise.all(
        files.map((file) => {
          return fs.unlink(file.path)
        }),
      )
      throw err
    })
  }
}
