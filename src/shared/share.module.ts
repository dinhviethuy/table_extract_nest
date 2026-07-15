import { Global, Module } from '@nestjs/common'
import { DocumentAiService } from './services/document-ai.service'
import { GoogleVisionService } from './services/google-vision.service'
import { ConcurrencyService } from './services/concurrency.service'
import { JobStoreService } from './services/job-store.service'
import { OcrQueueModule } from '../queues/ocr/ocr-queue.module'
import { TableQueueModule } from '../queues/table-extraction/table-queue.module'

const sharedServices = [DocumentAiService, GoogleVisionService, ConcurrencyService, JobStoreService]

@Global()
@Module({
  imports: [OcrQueueModule, TableQueueModule],
  providers: [...sharedServices],
  exports: sharedServices,
})
export class SharedModule {}
