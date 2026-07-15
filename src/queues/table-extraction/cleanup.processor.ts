import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TABLE_CLEANUP_QUEUE_NAME } from '../../shared/constants/ocr.constant'
import envConfig from '../../shared/configs/env'

@Injectable()
@Processor(TABLE_CLEANUP_QUEUE_NAME, { concurrency: 1 })
export class TableCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(TableCleanupProcessor.name)

  async process(job: Job<{ jobId: string }>): Promise<any> {
    const { jobId } = job.data
    const startTime = Date.now()
    this.logger.log(`[Job ${jobId}] Bắt đầu tác vụ dọn dẹp workspace trích xuất bảng.`)

    const jobDir = path.resolve(envConfig.TEMP_DIRECTORY, jobId)

    try {
      let dirExists = false
      try {
        await fs.access(jobDir)
        dirExists = true
      } catch {
        // Idempotent early return if doesn't exist
      }

      if (dirExists) {
        await fs.rm(jobDir, { recursive: true, force: true })
        this.logger.log(`[Job ${jobId}] Đã xoá sạch thư mục workspace tạm của bảng: ${jobDir}`)
      } else {
        this.logger.log(`[Job ${jobId}] Thư mục workspace tạm ${jobDir} đã được dọn dẹp trước đó.`)
      }

      this.logger.log(JSON.stringify({
        jobId,
        queue: TABLE_CLEANUP_QUEUE_NAME,
        worker: TableCleanupProcessor.name,
        duration: Date.now() - startTime,
        status: 'success',
      }))

    } catch (err: any) {
      this.logger.error(`[Job ${jobId}] Tác vụ dọn dẹp workspace thất bại`, err)

      this.logger.log(JSON.stringify({
        jobId,
        queue: TABLE_CLEANUP_QUEUE_NAME,
        worker: TableCleanupProcessor.name,
        duration: Date.now() - startTime,
        status: 'failed',
        errorCode: 'CLEANUP_ERROR',
        error: err.message,
      }))

      throw err
    }
  }
}
