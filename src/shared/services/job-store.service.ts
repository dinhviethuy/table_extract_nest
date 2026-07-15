import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import { BatchFileMetadata, BatchMetadata } from '../../routes/extract-text/extract-text.interface'
import { TableBatchFileMetadata, TableBatchMetadata } from '../../routes/extract-tables/extract-tables.interface'
import {
  OCR_QUEUE_NAME,
  TABLE_QUEUE_NAME,
  BATCH_KEY_PREFIX,
  TABLE_BATCH_KEY_PREFIX,
  BATCH_TTL_SECONDS,
} from '../constants/ocr.constant'

@Injectable()
export class JobStoreService {
  private readonly logger = new Logger(JobStoreService.name)

  constructor(
    @InjectQueue(OCR_QUEUE_NAME) private readonly ocrQueue: Queue,
    @InjectQueue(TABLE_QUEUE_NAME) private readonly tableQueue: Queue,
  ) {}

  // ==================== OCR BATCH METHODS ====================

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

  async getJobStatus(jobId: string): Promise<{
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown'
    progress: { completed: number; total: number }
    pages: any[]
    failedReason?: string
  }> {
    try {
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

  // ==================== TABLE BATCH METHODS ====================

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

  async getTableJobStatus(jobId: string): Promise<{
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown'
    progress: { completed: number; total: number }
    pages: any[]
    failedReason?: string
  }> {
    try {
      const job = await this.tableQueue.getJob(jobId)
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
      this.logger.error(`Lỗi khi lấy thông tin job Table: ${jobId}`, error)
      return { status: 'unknown', progress: { completed: 0, total: 0 }, pages: [] }
    }
  }
}
