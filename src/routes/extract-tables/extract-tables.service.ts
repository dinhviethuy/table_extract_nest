import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Queue } from 'bullmq'
import { Observable } from 'rxjs'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs/promises'
import * as path from 'path'
import { JobStoreService } from '../../shared/services/job-store.service'
import { TableBatchFileMetadata, TableBatchMetadata } from './extract-tables.interface'
import { TableJobData } from '../../queues/table-extraction/table-extraction.interface'
import { JobState } from '../../queues/ocr/ocr.interface'
import {
  TABLE_QUEUE_NAME,
  TABLE_CONVERT_QUEUE_NAME,
  TABLE_PROCESS_QUEUE_NAME,
} from '../../shared/constants/ocr.constant'
import envConfig from '../../shared/configs/env'

@Injectable()
export class ExtractTablesService {
  constructor(
    @InjectQueue(TABLE_QUEUE_NAME) private readonly tableQueue: Queue,
    @InjectQueue(TABLE_CONVERT_QUEUE_NAME) private readonly convertQueue: Queue,
    @InjectQueue(TABLE_PROCESS_QUEUE_NAME) private readonly processQueue: Queue,
    private readonly jobStoreService: JobStoreService,
  ) {}

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  }

  private async moveFile(src: string, dest: string) {
    try {
      await fs.rename(src, dest)
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        await fs.copyFile(src, dest)
        await fs.unlink(src).catch(() => {})
      } else {
        throw err
      }
    }
  }

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
      const sanitizedName = this.sanitizeFilename(originalName)

      // Tạo thư mục workspace cho job
      const jobDir = path.resolve(envConfig.TEMP_DIRECTORY, jobId)
      await fs.mkdir(jobDir, { recursive: true })

      const ext = path.extname(sanitizedName)
      const targetFilePath = path.join(jobDir, `original${ext}`)

      // Di chuyển tệp tạm Multer vào thư mục workspace vĩnh viễn
      await this.moveFile(file.path, targetFilePath)

      const jobData: TableJobData = {
        batchId,
        fileIndex: i,
        fileName: originalName,
        filePath: targetFilePath,
        mimeType: file.mimetype,
        totalPages: 0,
      }

      // Khởi tạo trạng thái job trong Redis
      await this.jobStoreService.saveTableJobStatusMeta(jobId, {
        status: JobState.QUEUED,
        progress: { completed: 0, total: 0 },
        createdAt: new Date().toISOString(),
      })

      const isWord = ['.doc', '.docx'].includes(ext.toLowerCase())

      if (isWord) {
        await this.convertQueue.add('table-convert-job', jobData, {
          jobId,
          attempts: 1,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        })
      } else {
        await this.processQueue.add('table-process-job', jobData, {
          jobId,
          attempts: envConfig.OCR_RETRY_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        })
      }

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

  async getBatchStatus(batchId: string, page?: number, pageSize?: number): Promise<any> {
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

        let paginatedPages = jobStatus.pages
        if (page && pageSize && jobStatus.pages.length > 0) {
          const startIndex = (page - 1) * pageSize
          const endIndex = startIndex + pageSize
          paginatedPages = jobStatus.pages.slice(startIndex, endIndex)
        }

        return {
          fileIndex: fileMeta.fileIndex,
          jobId: fileMeta.jobId,
          fileName: fileMeta.fileName,
          status,
          totalPages,
          completedPages: jobStatus.progress.completed,
          pages: paginatedPages,
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

  async getFileDetail(batchId: string, fileIndex: number, page: number = 1, pageSize: number = 10): Promise<any> {
    const batch = await this.jobStoreService.getTableBatch(batchId)
    if (!batch) {
      throw new NotFoundException(`Không tìm thấy lô trích xuất bảng với ID: ${batchId}`)
    }

    const fileMeta = batch.files.find((f) => f.fileIndex === fileIndex)
    if (!fileMeta) {
      throw new NotFoundException(`Không tìm thấy file với index: ${fileIndex} trong batch: ${batchId}`)
    }

    const jobStatus = await this.jobStoreService.getTableJobStatus(fileMeta.jobId)
    const totalPages = jobStatus.progress.total || fileMeta.totalPages

    const totalResultPages = Math.ceil(jobStatus.pages.length / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedPages = jobStatus.pages.slice(startIndex, endIndex)

    return {
      fileIndex,
      fileName: fileMeta.fileName,
      status: jobStatus.status,
      totalPages,
      completedPages: jobStatus.progress.completed,
      pages: paginatedPages,
      pagination: {
        page,
        pageSize,
        totalResultPages: totalResultPages || 1,
      },
      failedReason: jobStatus.failedReason,
    }
  }

  async getPageDetail(batchId: string, fileIndex: number, pageNumber: number): Promise<any> {
    const batch = await this.jobStoreService.getTableBatch(batchId)
    if (!batch) {
      throw new NotFoundException(`Không tìm thấy lô trích xuất bảng với ID: ${batchId}`)
    }

    const fileMeta = batch.files.find((f) => f.fileIndex === fileIndex)
    if (!fileMeta) {
      throw new NotFoundException(`Không tìm thấy file với index: ${fileIndex} trong batch: ${batchId}`)
    }

    const jobStatus = await this.jobStoreService.getTableJobStatus(fileMeta.jobId)
    const page = jobStatus.pages.find((p) => p.pageNumber === pageNumber)
    if (!page) {
      return {
        pageNumber,
        tables: [],
      }
    }

    return page
  }

  streamBatchProgress(batchId: string): Observable<any> {
    return new Observable((subscriber) => {
      const emittedDone = new Set<string>()

      const checkProgress = async (): Promise<boolean> => {
        try {
          const batch = await this.jobStoreService.getTableBatch(batchId)
          if (!batch) {
            subscriber.next({ data: { type: 'error', message: 'Không tìm thấy lô batch này' } })
            subscriber.complete()
            return true
          }

          let completedFiles = 0
          const totalFiles = batch.files.length

          for (const fileMeta of batch.files) {
            const jobStatus = await this.jobStoreService.getTableJobStatus(fileMeta.jobId)
            
            if (jobStatus.status === 'completed') {
              completedFiles++
              if (!emittedDone.has(fileMeta.jobId)) {
                emittedDone.add(fileMeta.jobId)
                subscriber.next({
                  data: {
                    type: 'file_done',
                    fileIndex: fileMeta.fileIndex,
                    fileName: fileMeta.fileName,
                  },
                })
              }
            } else if (jobStatus.status === 'failed') {
              completedFiles++
              if (!emittedDone.has(fileMeta.jobId)) {
                emittedDone.add(fileMeta.jobId)
                subscriber.next({
                  data: {
                    type: 'file_failed',
                    fileIndex: fileMeta.fileIndex,
                    fileName: fileMeta.fileName,
                    reason: jobStatus.failedReason,
                  },
                })
              }
            } else {
              subscriber.next({
                data: {
                  type: 'progress',
                  fileIndex: fileMeta.fileIndex,
                  fileName: fileMeta.fileName,
                  completed: jobStatus.progress.completed,
                  total: jobStatus.progress.total,
                  status: jobStatus.status,
                },
              })
            }
          }

          if (completedFiles === totalFiles) {
            subscriber.next({ data: { type: 'batch_done' } })
            subscriber.complete()
            return true
          }
        } catch (err) {
          subscriber.next({ data: { type: 'error', message: String(err) } })
          subscriber.complete()
          return true
        }
        return false
      }

      checkProgress().then((done) => {
        if (done) return

        const intervalId = setInterval(async () => {
          const done = await checkProgress()
          if (done) {
            clearInterval(intervalId)
          }
        }, 2000)

        subscriber.add(() => {
          clearInterval(intervalId)
        })
      })
    })
  }
}
