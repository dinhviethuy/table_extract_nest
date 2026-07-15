import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TableJobData } from './table-extraction.interface'
import { JobState } from '../ocr/ocr.interface'
import {
  TABLE_CONVERT_QUEUE_NAME,
  TABLE_PROCESS_QUEUE_NAME,
  TABLE_CLEANUP_QUEUE_NAME,
} from '../../shared/constants/ocr.constant'
import { LibreOfficeService } from '../../shared/services/libreoffice.service'
import { JobStoreService } from '../../shared/services/job-store.service'
import envConfig from '../../shared/configs/env'

@Injectable()
@Processor(TABLE_CONVERT_QUEUE_NAME, { concurrency: envConfig.LIBREOFFICE_CONCURRENCY })
export class TableConvertProcessor extends WorkerHost {
  private readonly logger = new Logger(TableConvertProcessor.name)

  constructor(
    private readonly libreOfficeService: LibreOfficeService,
    private readonly jobStoreService: JobStoreService,
    @InjectQueue(TABLE_PROCESS_QUEUE_NAME) private readonly processQueue: Queue,
    @InjectQueue(TABLE_CLEANUP_QUEUE_NAME) private readonly cleanupQueue: Queue,
  ) {
    super()
  }

  async process(job: Job<TableJobData>): Promise<any> {
    const { batchId, fileIndex, filePath, fileName } = job.data
    const currentJobId = job.id || `${batchId}_${fileIndex}`
    const startTime = Date.now()

    this.logger.log(`[Job ${currentJobId}] Bắt đầu chuyển đổi Word sang PDF cho tệp bảng biểu: ${fileName}`)

    const jobDir = path.resolve(envConfig.TEMP_DIRECTORY, currentJobId)
    await fs.mkdir(jobDir, { recursive: true })

    const processPromise = (async () => {
      const updateStatusSafe = async (newState: JobState) => {
        const current = await this.jobStoreService.getTableJobStatusMeta(currentJobId)
        if (current?.cancellationFlag) {
          throw new Error('CANCELLED')
        }
        await this.jobStoreService.saveTableJobStatusMeta(currentJobId, {
          status: newState,
          progress: current?.progress || { completed: 0, total: 0 },
          cancellationFlag: false,
          createdAt: current?.createdAt,
        })
      }

      const current = await this.jobStoreService.getTableJobStatusMeta(currentJobId)
      if (current?.cancellationFlag) {
        throw new Error('CANCELLED')
      }

      await updateStatusSafe(JobState.CONVERTING)

      const ext = path.extname(fileName)
      const originalPath = path.join(jobDir, `original${ext}`)
      await fs.rename(filePath, originalPath)

      const convertedPdfPath = await this.libreOfficeService.convertToPdf(originalPath, jobDir)

      this.logger.log(`[Job ${currentJobId}] Chuyển đổi Word sang PDF thành công. Đang xếp hàng đợi trích xuất bảng.`)

      await this.processQueue.add('table-process-job', {
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

      this.logger.log(JSON.stringify({
        jobId: currentJobId,
        queue: TABLE_CONVERT_QUEUE_NAME,
        worker: TableConvertProcessor.name,
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

      if (isCancellation) {
        await this.jobStoreService.saveTableJobStatusMeta(currentJobId, {
          status: JobState.CANCELLED,
          progress: { completed: 0, total: 0 },
          cancellationFlag: true,
        }).catch(() => {})
      } else {
        await this.jobStoreService.saveTableJobStatusMeta(currentJobId, {
          status: JobState.FAILED,
          progress: { completed: 0, total: 0 },
          failedReason: err.message || String(err),
        }).catch(() => {})
      }

      await this.cleanupQueue.add('table-cleanup-job', { jobId: currentJobId }, {
        delay: 0,
        attempts: 10,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      }).catch(() => {})

      this.logger.log(JSON.stringify({
        jobId: currentJobId,
        queue: TABLE_CONVERT_QUEUE_NAME,
        worker: TableConvertProcessor.name,
        duration: Date.now() - startTime,
        status: isCancellation ? 'cancelled' : 'failed',
        errorCode: isCancellation ? 'CANCELLED' : 'CONVERSION_ERROR',
        error: err.message,
      }))

      throw err
    }
  }
}
