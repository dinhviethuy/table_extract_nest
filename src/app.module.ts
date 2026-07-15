import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { BullModule } from '@nestjs/bullmq'
import { BullBoardModule } from '@bull-board/nestjs'
import { ExpressAdapter } from '@bull-board/express'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ExtractTablesModule } from './routes/extract-tables/extract-tables.module'
import { ExportExcelModule } from './routes/export-excel/export-excel.module'
import { ExtractTextModule } from './routes/extract-text/extract-text.module'
import { CustomZodSerializerInterceptor } from './shared/interceptor/custom-zod-serializer.interceptor'
import CustomZodValidationPipe from './shared/pipes/custom-zod-validation.pipe'
import { SharedModule } from './shared/share.module'
import envConfig from './shared/configs/env'

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: envConfig.REDIS_HOST,
        port: envConfig.REDIS_PORT,
      },
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    SharedModule,
    ExtractTablesModule,
    ExportExcelModule,
    ExtractTextModule,
  ],
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
