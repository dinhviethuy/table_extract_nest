import { Global, Module } from '@nestjs/common'
import { DocumentAiService } from './services/document-ai.service'

const sharedServices = [DocumentAiService]

@Global()
@Module({
  providers: [...sharedServices],
  exports: sharedServices,
  imports: [],
})
export class SharedModule {}
