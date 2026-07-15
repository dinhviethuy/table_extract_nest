import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import * as fs from 'fs/promises'
import * as path from 'path'
import { OCR_CLEANUP_QUEUE_NAME } from '../../shared/constants/ocr.constant'
import envConfig from '../../shared/configs/env'

@Injectable()
@Processor(OCR_CLEANUP_QUEUE_NAME, { concurrency: 1 })
export class CleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupProcessor.name)

  async process(job: Job<{ jobId: string }>): Promise<any> {
    const { jobId } = job.data
    const startTime = Date.now()
    this.logger.log(`[Job ${jobId}] Bắt đầu tác vụ dọn dẹp workspace.`)

    const jobDir = path.resolve(envConfig.TEMP_DIRECTORY, jobId)

    try {
      // Kiểm tra sự tồn tại của thư mục workspace
      let dirExists = false
      try {
        await fs.access(jobDir)
        dirExists = true
      } catch {
        // Thư mục không tồn tại, kết thúc sớm một cách idempotent
      }

      if (dirExists) {
        // Xoá đệ quy toàn bộ thư mục chứa file tạm
        await fs.rm(jobDir, { recursive: true, force: true })
        this.logger.log(`[Job ${jobId}] Đã xoá sạch thư mục workspace tạm: ${jobDir}`)
      } else {
        this.logger.log(`[Job ${jobId}] Thư mục workspace tạm ${jobDir} đã được dọn dẹp trước đó.`)
      }

      // Ghi log hiệu năng dạng JSON
      this.logger.log(JSON.stringify({
        jobId,
        queue: OCR_CLEANUP_QUEUE_NAME,
        worker: CleanupProcessor.name,
        duration: Date.now() - startTime,
        status: 'success',
      }))

    } catch (err: any) {
      this.logger.error(`[Job ${jobId}] Tác vụ dọn dẹp workspace thất bại`, err)

      // Ghi log lỗi dạng JSON
      this.logger.log(JSON.stringify({
        jobId,
        queue: OCR_CLEANUP_QUEUE_NAME,
        worker: CleanupProcessor.name,
        duration: Date.now() - startTime,
        status: 'failed',
        errorCode: 'CLEANUP_ERROR',
        error: err.message,
      }))

      throw err
    }
  }
}
