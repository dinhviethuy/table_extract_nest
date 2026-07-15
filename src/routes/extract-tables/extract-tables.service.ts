import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Queue } from 'bullmq'
import { v4 as uuidv4 } from 'uuid'
import { JobStoreService } from '../../shared/services/job-store.service'
import { TableBatchFileMetadata, TableBatchMetadata } from './extract-tables.interface'
import { TableJobData } from '../../queues/table-extraction/table-extraction.interface'
import { TABLE_QUEUE_NAME } from '../../shared/constants/ocr.constant'
import envConfig from '../../shared/configs/env'

@Injectable()
export class ExtractTablesService {
  constructor(
    @InjectQueue(TABLE_QUEUE_NAME) private readonly tableQueue: Queue,
    private readonly jobStoreService: JobStoreService,
  ) {}

  async createBatch(files: Array<Express.Multer.File>): Promise<{ batchId: string; files: TableBatchFileMetadata[] }> {
    if (!files?.length) {
      throw new BadRequestException('Không có file nào được upload')
    }

    const batchId = uuidv4()
    const filesMetadata: TableBatchFileMetadata[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const jobId = `${batchId}_${i}`
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
      
      const jobData: TableJobData = {
        batchId,
        fileIndex: i,
        fileName: originalName,
        filePath: file.path,
        mimeType: file.mimetype,
        totalPages: 0, // Computed by worker
      }

      await this.tableQueue.add('table-job', jobData, {
        jobId,
        attempts: envConfig.OCR_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      })

      filesMetadata.push({
        fileIndex: i,
        jobId,
        fileName: originalName,
        totalPages: 0,
        status: 'waiting',
      })
    }

    const batchMetadata: TableBatchMetadata = {
      batchId,
      createdAt: new Date().toISOString(),
      files: filesMetadata,
    }

    await this.jobStoreService.saveTableBatch(batchId, batchMetadata)

    return {
      batchId,
      files: filesMetadata,
    }
  }

  async getBatchStatus(batchId: string): Promise<any> {
    const batch = await this.jobStoreService.getTableBatch(batchId)
    if (!batch) {
      throw new NotFoundException(`Không tìm thấy lô trích xuất bảng với ID: ${batchId}`)
    }

    let completedFilesCount = 0
    const filesResults = await Promise.all(
      batch.files.map(async (fileMeta) => {
        const jobStatus = await this.jobStoreService.getTableJobStatus(fileMeta.jobId)
        
        let status = jobStatus.status
        if (status === 'unknown') {
          status = fileMeta.status as any
        }
        if (status === 'completed') {
          completedFilesCount++
        }

        const totalPages = jobStatus.progress.total || fileMeta.totalPages
        const tablePageNumbers = status === 'completed'
          ? jobStatus.pages.map((p) => p.pageNumber)
          : []

        return {
          fileIndex: fileMeta.fileIndex,
          jobId: fileMeta.jobId,
          fileName: fileMeta.fileName,
          status,
          totalPages,
          completedPages: jobStatus.progress.completed,
          pages: [], // Clear pages list to save bandwidth, lazy loaded on request
          tablePageNumbers,
          failedReason: jobStatus.failedReason,
        }
      })
    )

    let batchStatus = 'processing'
    if (completedFilesCount === batch.files.length) {
      batchStatus = 'completed'
    } else if (filesResults.some((f) => f.status === 'failed')) {
      const finishedOrFailed = filesResults.filter((f) => f.status === 'completed' || f.status === 'failed').length
      if (finishedOrFailed === batch.files.length) {
        batchStatus = 'failed'
      }
    } else if (filesResults.every((f) => f.status === 'waiting')) {
      batchStatus = 'waiting'
    }

    return {
      batchId,
      status: batchStatus,
      totalFiles: batch.files.length,
      completedFiles: completedFilesCount,
      files: filesResults,
    }
  }

  async getPageDetail(batchId: string, fileIndex: number, pageNumber: number): Promise<any> {
    const jobStatus = await this.jobStoreService.getTableJobStatus(`${batchId}_${fileIndex}`)
    if (jobStatus.status === 'unknown') {
      throw new NotFoundException(`Không tìm thấy tiến trình xử lý cho fileIndex: ${fileIndex}`)
    }

    const page = jobStatus.pages.find((p) => p.pageNumber === pageNumber)
    if (!page) {
      return {
        pageNumber,
        tables: [],
      }
    }

    return page
  }
}
