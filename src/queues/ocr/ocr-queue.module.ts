import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { BullBoardModule } from '@bull-board/nestjs'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ConvertProcessor } from './convert.processor'
import { ProcessProcessor } from './process.processor'
import { CleanupProcessor } from './cleanup.processor'
import { OcrProcessor } from './ocr.processor'
import {
  OCR_QUEUE_NAME,
  OCR_CONVERT_QUEUE_NAME,
  OCR_PROCESS_QUEUE_NAME,
  OCR_CLEANUP_QUEUE_NAME,
} from '../../shared/constants/ocr.constant'

@Module({
  imports: [
    BullModule.registerQueue(
      { name: OCR_QUEUE_NAME },
      { name: OCR_CONVERT_QUEUE_NAME },
      { name: OCR_PROCESS_QUEUE_NAME },
      { name: OCR_CLEANUP_QUEUE_NAME },
    ),
    BullBoardModule.forFeature(
      {
        name: OCR_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
      {
        name: OCR_CONVERT_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
      {
        name: OCR_PROCESS_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
      {
        name: OCR_CLEANUP_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
    ),
  ],
  providers: [OcrProcessor, ConvertProcessor, ProcessProcessor, CleanupProcessor],
  exports: [BullModule],
})
export class OcrQueueModule {}
