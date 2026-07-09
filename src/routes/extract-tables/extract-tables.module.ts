import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { existsSync, mkdirSync } from 'fs'
import multer from 'multer'
import { UPLOAD_DIR } from '../../shared/constants/other.constant'
import { generateRandomFilename } from '../../shared/utils/helper'
import { ExtractTablesController } from './extract-tables.controller'
import { ExtractTablesService } from './extract-tables.service'

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR)
  },
  filename: function (req, file, cb) {
    const newFileName = generateRandomFilename(file.originalname)
    cb(null, newFileName)
  },
})

@Module({
  imports: [
    MulterModule.register({
      storage,
    }),
  ],
  controllers: [ExtractTablesController],
  providers: [ExtractTablesService],
})
export class ExtractTablesModule {
  constructor() {
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true })
    }
  }
}
