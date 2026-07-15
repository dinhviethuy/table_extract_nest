import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TableProcessor } from './table.processor'
import { TABLE_QUEUE_NAME } from '../../shared/constants/ocr.constant'

@Module({
  imports: [
    BullModule.registerQueue({
      name: TABLE_QUEUE_NAME,
    }),
  ],
  providers: [TableProcessor],
  exports: [BullModule],
})
export class TableQueueModule {}
