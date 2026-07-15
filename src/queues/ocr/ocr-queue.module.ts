import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { OcrProcessor } from './ocr.processor'
import { OCR_QUEUE_NAME } from '../../shared/constants/ocr.constant'

@Module({
  imports: [
    BullModule.registerQueue({
      name: OCR_QUEUE_NAME,
    }),
  ],
  providers: [OcrProcessor],
  exports: [BullModule],
})
export class OcrQueueModule {}
