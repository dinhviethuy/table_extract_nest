import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { existsSync, mkdirSync } from 'fs'
import multer from 'multer'
import { UPLOAD_DIR } from '../../shared/constants/other.constant'
import { generateRandomFilename } from '../../shared/utils/helper'
import { ExtractTextController } from './extract-text.controller'
import { ExtractTextService } from './extract-text.service'
import { OcrQueueModule } from '../../queues/ocr/ocr-queue.module'

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
    OcrQueueModule,
  ],
  controllers: [ExtractTextController],
  providers: [ExtractTextService],
})
export class ExtractTextModule {
  constructor() {
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true })
    }
  }
}
