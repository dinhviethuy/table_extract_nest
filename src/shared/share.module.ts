import { Global, Module } from '@nestjs/common'
import { DocumentAiService } from './services/document-ai.service'
import { GoogleVisionService } from './services/google-vision.service'
import { ConcurrencyService } from './services/concurrency.service'
import { JobStoreService } from './services/job-store.service'
import { OcrQueueModule } from '../queues/ocr/ocr-queue.module'
import { TableQueueModule } from '../queues/table-extraction/table-queue.module'
import { LocalFileResultStorageService } from './services/local-file-result-storage.service'
import { PdfToolService } from './services/pdf-tool.service'
import { LibreOfficeService } from './services/libreoffice.service'

const sharedServices = [
  DocumentAiService,
  GoogleVisionService,
  ConcurrencyService,
  JobStoreService,
  PdfToolService,
  LibreOfficeService,
]

@Global()
@Module({
  imports: [OcrQueueModule, TableQueueModule],
  providers: [
    ...sharedServices,
    {
      provide: 'ResultStorage',
      useClass: LocalFileResultStorageService,
    },
  ],
  exports: [
    ...sharedServices,
    'ResultStorage',
  ],
})
export class SharedModule {}
