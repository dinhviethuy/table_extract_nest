import { Controller, Get, Post, Param, HttpCode, HttpStatus } from '@nestjs/common'
import { AppService } from './app.service'
import { JobStoreService } from './shared/services/job-store.service'

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly jobStoreService: JobStoreService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello()
  }

  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelJob(@Param('id') id: string) {
    await this.jobStoreService.cancelJob(id)
    return { jobId: id, status: 'cancelled' }
  }
}
