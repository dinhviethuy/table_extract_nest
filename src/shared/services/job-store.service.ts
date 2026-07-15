import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, Inject } from '@nestjs/common'
import { Queue } from 'bullmq'
import { BatchFileMetadata, BatchMetadata } from '../../routes/extract-text/extract-text.interface'
import { TableBatchFileMetadata, TableBatchMetadata } from '../../routes/extract-tables/extract-tables.interface'
import {
  OCR_QUEUE_NAME,
  TABLE_QUEUE_NAME,
  BATCH_KEY_PREFIX,
  TABLE_BATCH_KEY_PREFIX,
  BATCH_TTL_SECONDS,
  OCR_JOB_KEY_PREFIX,
  TABLE_JOB_KEY_PREFIX,
} from '../constants/ocr.constant'
import type { ResultStorage } from '../interfaces/result-storage.interface'
import { JobState } from '../../queues/ocr/ocr.interface'

export interface OcrJobStatus {
  status: JobState
  progress: { completed: number; total: number }
  createdAt?: string
  startedAt?: string
  completedAt?: string
  failedReason?: string
  cancellationFlag?: boolean
}

@Injectable()
export class JobStoreService {
  private readonly logger = new Logger(JobStoreService.name)

  constructor(
    @InjectQueue(OCR_QUEUE_NAME) private readonly ocrQueue: Queue,
    @InjectQueue(TABLE_QUEUE_NAME) private readonly tableQueue: Queue,
    @Inject('ResultStorage') private readonly resultStorage: ResultStorage,
  ) {}

  // ==================== PHƯƠNG THỨC OCR BATCH ====================

  async saveBatch(batchId: string, metadata: BatchMetadata): Promise<void> {
    try {
      const redis = await this.ocrQueue.client
      const key = `${BATCH_KEY_PREFIX}${batchId}`
      await redis.set(key, JSON.stringify(metadata), { EX: BATCH_TTL_SECONDS })
    } catch (error) {
      this.logger.error(`Không thể lưu batch metadata vào Redis cho batch: ${batchId}`, error)
      throw error
    }
  }

  async getBatch(batchId: string): Promise<BatchMetadata | null> {
    try {
      const redis = await this.ocrQueue.client
      const key = `${BATCH_KEY_PREFIX}${batchId}`
      const data = await redis.get(key)
      if (!data) return null
      return JSON.parse(data) as BatchMetadata
    } catch (error) {
      this.logger.error(`Không thể đọc batch metadata từ Redis cho batch: ${batchId}`, error)
      return null
    }
  }

  async saveOcrJobStatus(jobId: string, status: OcrJobStatus): Promise<void> {
    try {
      const redis = await this.ocrQueue.client
      const key = `${OCR_JOB_KEY_PREFIX}${jobId}`
      await redis.set(key, JSON.stringify(status), { EX: BATCH_TTL_SECONDS })
    } catch (error) {
      this.logger.error(`Không thể lưu trạng thái job OCR vào Redis cho jobId: ${jobId}`, error)
      throw error
    }
  }

  async getOcrJobStatus(jobId: string): Promise<OcrJobStatus | null> {
    try {
      const redis = await this.ocrQueue.client
      const key = `${OCR_JOB_KEY_PREFIX}${jobId}`
      const data = await redis.get(key)
      if (!data) return null
      return JSON.parse(data) as OcrJobStatus
    } catch (error) {
      this.logger.error(`Không thể đọc trạng thái job OCR từ Redis cho jobId: ${jobId}`, error)
      return null
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    try {
      const ocrStatus = await this.getOcrJobStatus(jobId)
      if (ocrStatus) {
        ocrStatus.cancellationFlag = true
        ocrStatus.status = JobState.CANCELLED
        await this.saveOcrJobStatus(jobId, ocrStatus)
        this.logger.log(`Đã đặt cờ huỷ cho OCR Job ${jobId} trong Redis.`)
      }

      const tableStatus = await this.getTableJobStatusMeta(jobId)
      if (tableStatus) {
        tableStatus.cancellationFlag = true
        tableStatus.status = JobState.CANCELLED
        await this.saveTableJobStatusMeta(jobId, tableStatus)
        this.logger.log(`Đã đặt cờ huỷ cho Table Job ${jobId} trong Redis.`)
      }

      if (!ocrStatus && !tableStatus) {
        await this.saveOcrJobStatus(jobId, {
          status: JobState.CANCELLED,
          progress: { completed: 0, total: 0 },
          cancellationFlag: true,
        })
        await this.saveTableJobStatusMeta(jobId, {
          status: JobState.CANCELLED,
          progress: { completed: 0, total: 0 },
          cancellationFlag: true,
        })
      }
    } catch (error) {
      this.logger.error(`Huỷ job thất bại cho jobId: ${jobId}`, error)
      throw error
    }
  }

  async getJobStatus(jobId: string): Promise<{
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown'
    progress: { completed: number; total: number }
    pages: any[]
    failedReason?: string
  }> {
    try {
      const redisStatus = await this.getOcrJobStatus(jobId)
      if (redisStatus) {
        let mappedStatus: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown' = 'unknown'
        switch (redisStatus.status) {
          case JobState.QUEUED:
            mappedStatus = 'waiting'
            break
          case JobState.CONVERTING:
          case JobState.SPLITTING:
          case JobState.OCR_PROCESSING:
          case JobState.SAVING_RESULTS:
            mappedStatus = 'active'
            break
          case JobState.COMPLETED:
            mappedStatus = 'completed'
            break
          case JobState.FAILED:
          case JobState.CANCELLED:
            mappedStatus = 'failed'
            break
          default:
            mappedStatus = 'unknown'
        }

        const pages = mappedStatus === 'completed'
          ? await this.resultStorage.getResults(jobId)
          : []

        return {
          status: mappedStatus,
          progress: redisStatus.progress || { completed: 0, total: 0 },
          pages,
          failedReason: redisStatus.failedReason,
        }
      }

      const job = await this.ocrQueue.getJob(jobId)
      if (!job) {
        return { status: 'unknown', progress: { completed: 0, total: 0 }, pages: [] }
      }

      const state = await job.getState()
      const progress = typeof job.progress === 'object' && job.progress !== null
        ? (job.progress as { completed: number; total: number })
        : { completed: 0, total: 0 }

      const pages = job.returnvalue?.pages || []

      return {
        status: state === 'completed' || state === 'failed' || state === 'active' || state === 'waiting' ? state : 'unknown',
        progress,
        pages,
        failedReason: job.failedReason,
      }
    } catch (error) {
      this.logger.error(`Lỗi khi lấy thông tin job OCR: ${jobId}`, error)
      return { status: 'unknown', progress: { completed: 0, total: 0 }, pages: [] }
    }
  }

  // ==================== PHƯƠNG THỨC TABLE BATCH ====================

  async saveTableBatch(batchId: string, metadata: TableBatchMetadata): Promise<void> {
    try {
      const redis = await this.tableQueue.client
      const key = `${TABLE_BATCH_KEY_PREFIX}${batchId}`
      await redis.set(key, JSON.stringify(metadata), { EX: BATCH_TTL_SECONDS })
    } catch (error) {
      this.logger.error(`Không thể lưu table batch metadata vào Redis cho batch: ${batchId}`, error)
      throw error
    }
  }

  async getTableBatch(batchId: string): Promise<TableBatchMetadata | null> {
    try {
      const redis = await this.tableQueue.client
      const key = `${TABLE_BATCH_KEY_PREFIX}${batchId}`
      const data = await redis.get(key)
      if (!data) return null
      return JSON.parse(data) as TableBatchMetadata
    } catch (error) {
      this.logger.error(`Không thể đọc table batch metadata từ Redis cho batch: ${batchId}`, error)
      return null
    }
  }

  async saveTableJobStatusMeta(jobId: string, status: OcrJobStatus): Promise<void> {
    try {
      const redis = await this.tableQueue.client
      const key = `${TABLE_JOB_KEY_PREFIX}${jobId}`
      await redis.set(key, JSON.stringify(status), { EX: BATCH_TTL_SECONDS })
    } catch (error) {
      this.logger.error(`Không thể lưu trạng thái job Table vào Redis cho jobId: ${jobId}`, error)
      throw error
    }
  }

  async getTableJobStatusMeta(jobId: string): Promise<OcrJobStatus | null> {
    try {
      const redis = await this.tableQueue.client
      const key = `${TABLE_JOB_KEY_PREFIX}${jobId}`
      const data = await redis.get(key)
      if (!data) return null
      return JSON.parse(data) as OcrJobStatus
    } catch (error) {
      this.logger.error(`Không thể đọc trạng thái job Table từ Redis cho jobId: ${jobId}`, error)
      return null
    }
  }

  async getTableJobStatus(jobId: string): Promise<{
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown'
    progress: { completed: number; total: number }
    pages: any[]
    failedReason?: string
  }> {
    try {
      const redisStatus = await this.getTableJobStatusMeta(jobId)
      if (redisStatus) {
        let mappedStatus: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown' = 'unknown'
        switch (redisStatus.status) {
          case JobState.QUEUED:
            mappedStatus = 'waiting'
            break
          case JobState.CONVERTING:
          case JobState.SPLITTING:
          case JobState.OCR_PROCESSING: // reused for Document AI processing
          case JobState.SAVING_RESULTS:
            mappedStatus = 'active'
            break
          case JobState.COMPLETED:
            mappedStatus = 'completed'
            break
          case JobState.FAILED:
          case JobState.CANCELLED:
            mappedStatus = 'failed'
            break
          default:
            mappedStatus = 'unknown'
        }

        const pages = mappedStatus === 'completed'
          ? await this.resultStorage.getResults(jobId)
          : []

        return {
          status: mappedStatus,
          progress: redisStatus.progress || { completed: 0, total: 0 },
          pages,
          failedReason: redisStatus.failedReason,
        }
      }

      const job = await this.tableQueue.getJob(jobId)
      if (!job) {
        return { status: 'unknown', progress: { completed: 0, total: 0 }, pages: [] }
      }

      const state = await job.getState()
      const progress = typeof job.progress === 'object' && job.progress !== null
        ? (job.progress as { completed: number; total: number })
        : { completed: 0, total: 0 }

      const pages = state === 'completed'
        ? await this.resultStorage.getResults(jobId)
        : []

      return {
        status: state === 'completed' || state === 'failed' || state === 'active' || state === 'waiting' ? state : 'unknown',
        progress,
        pages,
        failedReason: job.failedReason,
      }
    } catch (error) {
      this.logger.error(`Lỗi khi lấy thông tin job Table: ${jobId}`, error)
      return { status: 'unknown', progress: { completed: 0, total: 0 }, pages: [] }
    }
  }
}
