import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { BullBoardModule } from '@bull-board/nestjs'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { TableConvertProcessor } from './convert.processor'
import { TableProcessProcessor } from './process.processor'
import { TableCleanupProcessor } from './cleanup.processor'
import {
  TABLE_QUEUE_NAME,
  TABLE_CONVERT_QUEUE_NAME,
  TABLE_PROCESS_QUEUE_NAME,
  TABLE_CLEANUP_QUEUE_NAME,
} from '../../shared/constants/ocr.constant'

@Module({
  imports: [
    BullModule.registerQueue(
      { name: TABLE_QUEUE_NAME },
      { name: TABLE_CONVERT_QUEUE_NAME },
      { name: TABLE_PROCESS_QUEUE_NAME },
      { name: TABLE_CLEANUP_QUEUE_NAME },
    ),
    BullBoardModule.forFeature(
      {
        name: TABLE_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
      {
        name: TABLE_CONVERT_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
      {
        name: TABLE_PROCESS_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
      {
        name: TABLE_CLEANUP_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
    ),
  ],
  providers: [TableConvertProcessor, TableProcessProcessor, TableCleanupProcessor],
  exports: [BullModule],
})
export class TableQueueModule {}
