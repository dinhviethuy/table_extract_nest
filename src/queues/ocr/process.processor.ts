import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, Inject } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import * as fs from 'fs/promises'
import * as path from 'path'
import pLimit from 'p-limit'
import { v4 as uuidv4 } from 'uuid'
import { OcrJobData, JobState } from './ocr.interface'
import {
  OCR_PROCESS_QUEUE_NAME,
  OCR_CLEANUP_QUEUE_NAME,
} from '../../shared/constants/ocr.constant'
import { GoogleVisionService } from '../../shared/services/google-vision.service'
import { PdfToolService } from '../../shared/services/pdf-tool.service'
import type { ResultStorage } from '../../shared/interfaces/result-storage.interface'
import { JobStoreService } from '../../shared/services/job-store.service'
import envConfig from '../../shared/configs/env'

@Injectable()
@Processor(OCR_PROCESS_QUEUE_NAME, { concurrency: envConfig.PROCESS_WORKER_CONCURRENCY })
export class ProcessProcessor extends WorkerHost {
  private readonly logger = new Logger(ProcessProcessor.name)

  constructor(
    private readonly googleVisionService: GoogleVisionService,
    private readonly pdfToolService: PdfToolService,
    @Inject('ResultStorage') private readonly resultStorage: ResultStorage,
    private readonly jobStoreService: JobStoreService,
    @InjectQueue(OCR_CLEANUP_QUEUE_NAME) private readonly cleanupQueue: Queue,
  ) {
    super()
  }

  async process(job: Job<OcrJobData>): Promise<any> {
    const { batchId, fileIndex, filePath, fileName, mimeType } = job.data
    const currentJobId = job.id || `${batchId}_${fileIndex}`
    const attemptToken = uuidv4()
    const startTime = Date.now()

    this.logger.log(`[Job ${currentJobId}] Khởi chạy tiến trình xử lý OCR (attemptToken: ${attemptToken})`)

    const jobDir = path.resolve(envConfig.TEMP_DIRECTORY, currentJobId)
    await fs.mkdir(jobDir, { recursive: true })

    const processPromise = (async () => {
      // Hàm cập nhật trạng thái Redis an toàn, bảo toàn cờ huỷ cancellationFlag
      const updateStatusSafe = async (newState: JobState, progress?: { completed: number, total: number }) => {
        const current = await this.jobStoreService.getOcrJobStatus(currentJobId)
        if (current?.cancellationFlag) {
          throw new Error('CANCELLED')
        }
        await this.jobStoreService.saveOcrJobStatus(currentJobId, {
          status: newState,
          progress: progress || current?.progress || { completed: 0, total: 0 },
          cancellationFlag: false,
          createdAt: current?.createdAt,
        })
      }

      // Kiểm tra huỷ job ngay từ đầu
      const initialCheck = await this.jobStoreService.getOcrJobStatus(currentJobId)
      if (initialCheck?.cancellationFlag) {
        throw new Error('CANCELLED')
      }

      // Cập nhật trạng thái sang SPLITTING (Đang tách trang)
      await updateStatusSafe(JobState.SPLITTING)

      // 2. Xác định định dạng tệp và tổng số trang
      let totalPages = 1
      const isPdf = mimeType === 'application/pdf' || path.extname(filePath).toLowerCase() === '.pdf'

      if (isPdf) {
        totalPages = await this.pdfToolService.getPageCount(filePath)
        if (totalPages > envConfig.MAX_PDF_PAGES) {
          throw new Error(`Số trang PDF (${totalPages}) vượt quá giới hạn tối đa cho phép (${envConfig.MAX_PDF_PAGES})`)
        }
      }

      // Cập nhật trạng thái sang OCR_PROCESSING (Đang xử lý OCR)
      await updateStatusSafe(JobState.OCR_PROCESSING, { completed: 0, total: totalPages })

      // Xoá kết quả của các lần chạy (attempt) cũ nếu có để tránh nhiễu dữ liệu
      await this.resultStorage.deleteResults(currentJobId).catch(() => {})

      // 3. Xử lý OCR từng trang song song giới hạn bởi VISION_CONCURRENCY
      const limit = pLimit(envConfig.VISION_CONCURRENCY)
      let completedCount = 0
      let lastProgressTime = Date.now()
      let lastProgressPercent = 0

      // Hàm cập nhật tiến độ có cơ chế throttle chống spam Redis
      const updateProgressThrottled = async (completed: number, total: number) => {
        const now = Date.now()
        const percent = Math.floor((completed / total) * 100)
        const timeElapsed = now - lastProgressTime
        const percentIncreased = percent - lastProgressPercent

        if (timeElapsed >= 2000 || percentIncreased >= 5 || completed === total) {
          lastProgressTime = now
          lastProgressPercent = percent
          
          try {
            const current = await this.jobStoreService.getOcrJobStatus(currentJobId)
            if (current?.cancellationFlag) {
              throw new Error('CANCELLED')
            }
            await this.jobStoreService.saveOcrJobStatus(currentJobId, {
              status: JobState.OCR_PROCESSING,
              progress: { completed, total },
              cancellationFlag: false,
              createdAt: current?.createdAt,
            })
          } catch (redisErr: any) {
            if (redisErr.message === 'CANCELLED') {
              throw redisErr
            }
            this.logger.warn(`[Job ${currentJobId}] Lỗi cập nhật tiến độ Redis (có thể bỏ qua): ${redisErr.message}`)
          }
        }
      }

      const tasks = Array.from({ length: totalPages }, (_, idx) => {
        const pageNum = idx + 1
        return limit(async () => {
          // Kiểm tra huỷ tác vụ chủ động
          const currentStatus = await this.jobStoreService.getOcrJobStatus(currentJobId)
          if (currentStatus?.cancellationFlag) {
            throw new Error('CANCELLED')
          }

          let pageImgPath: string | null = null
          try {
            // Render ảnh cho riêng trang này
            if (isPdf) {
              const pageImgPrefix = path.join(jobDir, `page`)
              pageImgPath = await this.pdfToolService.renderSinglePage(filePath, pageNum, pageImgPrefix)
            } else {
              pageImgPath = filePath
            }

            // Đọc tệp ảnh vào buffer
            const buffer = await fs.readFile(pageImgPath)

            // Gọi Vision API có retry + exponential backoff + jitter
            const ocrResult = await this.ocrWithRetry(buffer, currentJobId, pageNum)

            // Ghi trực tiếp kết quả vào file JSONL tạm thời
            await this.resultStorage.appendPageResult(currentJobId, attemptToken, {
              pageNumber: pageNum,
              text: ocrResult.text,
              confidence: ocrResult.confidence,
            })

            // Xoá ảnh PNG tạm của trang ngay lập tức để tiết kiệm bộ nhớ (O(1) RAM)
            if (isPdf && pageImgPath) {
              await fs.unlink(pageImgPath).catch(() => {})
              pageImgPath = null
            }

            // Tự động giải phóng biến buffer nhờ kết thúc scope
            completedCount++
            await updateProgressThrottled(completedCount, totalPages)

            // Ghi log tiến độ dạng JSON cấu trúc
            this.logger.log(JSON.stringify({
              jobId: currentJobId,
              attemptToken,
              queue: OCR_PROCESS_QUEUE_NAME,
              worker: ProcessProcessor.name,
              page: pageNum,
              status: 'page_processed',
              ramUsage: process.memoryUsage().heapUsed,
              cpuUsage: process.cpuUsage().user,
            }))

          } catch (err: any) {
            if (isPdf && pageImgPath) {
              await fs.unlink(pageImgPath).catch(() => {})
            }
            throw err
          }
        })
      })

      // Khởi chạy tất cả các luồng xử lý trang PDF
      await Promise.all(tasks)

      // Cập nhật trạng thái sang SAVING_RESULTS (Đang lưu kết quả)
      await updateStatusSafe(JobState.SAVING_RESULTS, { completed: totalPages, total: totalPages })

      // 4. Thăng hạng nguyên tử (atomic promotion) tệp tạm thời thành tệp kết quả cuối cùng
      await this.resultStorage.promoteResults(currentJobId, attemptToken)

      // Cập nhật trạng thái sang COMPLETED (Hoàn thành)
      const finalCheck = await this.jobStoreService.getOcrJobStatus(currentJobId)
      await this.jobStoreService.saveOcrJobStatus(currentJobId, {
        status: JobState.COMPLETED,
        progress: { completed: totalPages, total: totalPages },
        cancellationFlag: false,
        createdAt: finalCheck?.createdAt,
        completedAt: new Date().toISOString(),
      })

      this.logger.log(`[Job ${currentJobId}] Xử lý OCR thành công. Đang lập lịch dọn dẹp workspace.`)

      // 5. Đẩy hàng đợi dọn dẹp workspace sau một khoảng thời gian chờ (TTL)
      await this.cleanupQueue.add('ocr-cleanup-job', { jobId: currentJobId }, {
        delay: envConfig.JOB_CLEANUP_TTL_MS,
        attempts: 10,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      })

      // Ghi log thống kê hiệu năng thành công
      this.logger.log(JSON.stringify({
        jobId: currentJobId,
        attemptToken,
        queue: OCR_PROCESS_QUEUE_NAME,
        worker: ProcessProcessor.name,
        duration: Date.now() - startTime,
        status: 'success',
        ramUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage().user,
      }))
    })()

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('JOB_TIMEOUT')), envConfig.JOB_TIMEOUT)
    )

    try {
      await Promise.race([processPromise, timeoutPromise])
    } catch (err: any) {
      const isCancellation = err.message === 'CANCELLED'

      if (isCancellation) {
        this.logger.warn(`[Job ${currentJobId}] Tác vụ đã được huỷ bỏ chủ động từ người dùng.`)
        await this.jobStoreService.saveOcrJobStatus(currentJobId, {
          status: JobState.CANCELLED,
          progress: { completed: 0, total: 0 },
          cancellationFlag: true,
        }).catch(() => {})
      } else {
        this.logger.error(`[Job ${currentJobId}] Tác vụ OCR thất bại`, err)
        await this.jobStoreService.saveOcrJobStatus(currentJobId, {
          status: JobState.FAILED,
          progress: { completed: 0, total: 0 },
          failedReason: err.message || String(err),
        }).catch(() => {})
      }

      // Lập lịch dọn dẹp workspace ngay lập tức nếu thất bại hoặc huỷ tác vụ
      await this.cleanupQueue.add('ocr-cleanup-job', { jobId: currentJobId }, {
        delay: 0,
        attempts: 10,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      }).catch(() => {})

      // Xoá file attempt tạm thời để tránh rác ổ đĩa
      await this.resultStorage.deleteResults(currentJobId).catch(() => {})

      // Ghi log hiệu năng thất bại
      this.logger.log(JSON.stringify({
        jobId: currentJobId,
        attemptToken,
        queue: OCR_PROCESS_QUEUE_NAME,
        worker: ProcessProcessor.name,
        duration: Date.now() - startTime,
        status: isCancellation ? 'cancelled' : 'failed',
        errorCode: isCancellation ? 'CANCELLED' : 'PROCESS_ERROR',
        error: err.message,
      }))

      throw err
    }
  }

  private async ocrWithRetry(
    buffer: Buffer,
    jobId: string,
    pageNum: number,
  ): Promise<{ text: string; confidence: number }> {
    let attempt = 0
    const maxAttempts = envConfig.JOB_RETRY_ATTEMPTS
    const baseDelay = 1000

    while (true) {
      try {
        attempt++
        return await this.googleVisionService.extractTextFromImagePage(buffer)
      } catch (err: any) {
        // Phân loại các lỗi có thể thử lại
        const isRateLimit = err.status === 429 || err.message?.includes('429')
        const isTempError =
          err.status >= 500 ||
          err.message?.includes('500') ||
          err.message?.includes('Timeout') ||
          err.message?.includes('ETIMEDOUT')

        if ((isRateLimit || isTempError) && attempt < maxAttempts) {
          // Exponential backoff kết hợp với jitter ngẫu nhiên
          const jitter = Math.random() * 1000
          const backoffDelay = baseDelay * Math.pow(2, attempt) + jitter
          
          this.logger.warn(
            `[Job ${jobId}] Gặp lỗi tạm thời khi gọi Vision API trang ${pageNum} (lần thử ${attempt}/${maxAttempts}). Thử lại sau ${Math.round(backoffDelay)}ms. Lỗi: ${err.message}`,
          )
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        } else {
          throw err
        }
      }
    }
  }
}
