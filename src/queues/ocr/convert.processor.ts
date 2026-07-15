import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import * as fs from 'fs/promises'
import * as path from 'path'
import { OcrJobData, JobState } from './ocr.interface'
import {
  OCR_CONVERT_QUEUE_NAME,
  OCR_PROCESS_QUEUE_NAME,
  OCR_CLEANUP_QUEUE_NAME,
} from '../../shared/constants/ocr.constant'
import { LibreOfficeService } from '../../shared/services/libreoffice.service'
import { JobStoreService } from '../../shared/services/job-store.service'
import envConfig from '../../shared/configs/env'

@Injectable()
@Processor(OCR_CONVERT_QUEUE_NAME, { concurrency: envConfig.LIBREOFFICE_CONCURRENCY })
export class ConvertProcessor extends WorkerHost {
  private readonly logger = new Logger(ConvertProcessor.name)

  constructor(
    private readonly libreOfficeService: LibreOfficeService,
    private readonly jobStoreService: JobStoreService,
    @InjectQueue(OCR_PROCESS_QUEUE_NAME) private readonly processQueue: Queue,
    @InjectQueue(OCR_CLEANUP_QUEUE_NAME) private readonly cleanupQueue: Queue,
  ) {
    super()
  }

  async process(job: Job<OcrJobData>): Promise<any> {
    const { batchId, fileIndex, filePath, fileName } = job.data
    const currentJobId = job.id || `${batchId}_${fileIndex}`
    const startTime = Date.now()

    this.logger.log(`[Job ${currentJobId}] Bắt đầu chuyển đổi Word sang PDF cho tệp: ${fileName}`)

    // Tạo thư mục workspace độc lập cho job
    const jobDir = path.resolve(envConfig.TEMP_DIRECTORY, currentJobId)
    await fs.mkdir(jobDir, { recursive: true })

    const processPromise = (async () => {
      // Hàm cập nhật trạng thái an toàn, bảo toàn cờ huỷ cancellationFlag
      const updateStatusSafe = async (newState: JobState) => {
        const current = await this.jobStoreService.getOcrJobStatus(currentJobId)
        if (current?.cancellationFlag) {
          throw new Error('CANCELLED')
        }
        await this.jobStoreService.saveOcrJobStatus(currentJobId, {
          status: newState,
          progress: { completed: 0, total: 0 },
          cancellationFlag: false,
          createdAt: current?.createdAt,
        })
      }

      // Kiểm tra huỷ job ngay từ đầu
      const current = await this.jobStoreService.getOcrJobStatus(currentJobId)
      if (current?.cancellationFlag) {
        throw new Error('CANCELLED')
      }

      // Cập nhật trạng thái Redis sang CONVERTING
      await updateStatusSafe(JobState.CONVERTING)

      // Di chuyển tệp tin gốc vào workspace dưới dạng uploads/<jobId>/original.<ext>
      const ext = path.extname(fileName)
      const originalPath = path.join(jobDir, `original${ext}`)
      await fs.rename(filePath, originalPath)

      // Thực hiện chuyển đổi qua LibreOffice
      const convertedPdfPath = await this.libreOfficeService.convertToPdf(originalPath, jobDir)

      this.logger.log(`[Job ${currentJobId}] Chuyển đổi Word sang PDF thành công. Đang xếp hàng đợi OCR.`)

      // Đẩy job xử lý OCR tiếp theo vào ocr-process queue
      await this.processQueue.add('ocr-process-job', {
        ...job.data,
        filePath: convertedPdfPath,
        mimeType: 'application/pdf',
      }, {
        jobId: currentJobId,
        attempts: envConfig.JOB_RETRY_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      })

      // Ghi log thống kê hiệu năng dưới dạng JSON
      this.logger.log(JSON.stringify({
        jobId: currentJobId,
        queue: OCR_CONVERT_QUEUE_NAME,
        worker: ConvertProcessor.name,
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
      this.logger.error(`[Job ${currentJobId}] Lỗi trong quá trình chuyển đổi Word sang PDF`, err)

      // Cập nhật trạng thái thất bại hoặc đã huỷ trong Redis
      if (isCancellation) {
        await this.jobStoreService.saveOcrJobStatus(currentJobId, {
          status: JobState.CANCELLED,
          progress: { completed: 0, total: 0 },
          cancellationFlag: true,
        }).catch(() => {})
      } else {
        await this.jobStoreService.saveOcrJobStatus(currentJobId, {
          status: JobState.FAILED,
          progress: { completed: 0, total: 0 },
          failedReason: err.message || String(err),
        }).catch(() => {})
      }

      // Đẩy job dọn dẹp workspace ngay lập tức nếu thất bại/huỷ bỏ
      await this.cleanupQueue.add('ocr-cleanup-job', { jobId: currentJobId }, {
        delay: 0,
        attempts: 10,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      }).catch(() => {})

      // Ghi log thống kê hiệu năng khi gặp lỗi
      this.logger.log(JSON.stringify({
        jobId: currentJobId,
        queue: OCR_CONVERT_QUEUE_NAME,
        worker: ConvertProcessor.name,
        duration: Date.now() - startTime,
        status: isCancellation ? 'cancelled' : 'failed',
        errorCode: isCancellation ? 'CANCELLED' : 'CONVERSION_ERROR',
        error: err.message,
      }))

      throw err
    }
  }
}
