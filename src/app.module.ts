import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ExtractTablesModule } from './routes/extract-tables/extract-tables.module'
import { ExportExcelModule } from './routes/export-excel/export-excel.module'
import { CustomZodSerializerInterceptor } from './shared/interceptor/custom-zod-serializer.interceptor'
import CustomZodValidationPipe from './shared/pipes/custom-zod-validation.pipe'
import { SharedModule } from './shared/share.module'

@Module({
  imports: [SharedModule, ExtractTablesModule, ExportExcelModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CustomZodSerializerInterceptor,
    },
    {
      provide: APP_PIPE,
      useClass: CustomZodValidationPipe,
    },
  ],
})
export class AppModule {}
