import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, Inject } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import * as fs from 'fs/promises'
import * as path from 'path'
import pLimit from 'p-limit'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { TableJobData } from './table-extraction.interface'
import { JobState } from '../ocr/ocr.interface'
import {
  TABLE_PROCESS_QUEUE_NAME,
  TABLE_CLEANUP_QUEUE_NAME,
} from '../../shared/constants/ocr.constant'
import { DocumentAiService } from '../../shared/services/document-ai.service'
import { ConcurrencyService } from '../../shared/services/concurrency.service'
import type { ResultStorage } from '../../shared/interfaces/result-storage.interface'
import { JobStoreService } from '../../shared/services/job-store.service'
import envConfig from '../../shared/configs/env'

@Injectable()
@Processor(TABLE_PROCESS_QUEUE_NAME, { concurrency: envConfig.PROCESS_WORKER_CONCURRENCY })
export class TableProcessProcessor extends WorkerHost {
  private readonly logger = new Logger(TableProcessProcessor.name)

  constructor(
    private readonly documentAiService: DocumentAiService,
    private readonly concurrencyService: ConcurrencyService,
    @Inject('ResultStorage') private readonly resultStorage: ResultStorage,
    private readonly jobStoreService: JobStoreService,
    @InjectQueue(TABLE_CLEANUP_QUEUE_NAME) private readonly cleanupQueue: Queue,
  ) {
    super()
  }

  async process(job: Job<TableJobData>): Promise<any> {
    const { batchId, fileIndex, filePath, fileName, mimeType } = job.data
    const currentJobId = job.id || `${batchId}_${fileIndex}`
    const attemptToken = uuidv4()
    const startTime = Date.now()

    this.logger.log(`[Job ${currentJobId}] Khởi chạy tiến trình xử lý trích xuất bảng (attemptToken: ${attemptToken})`)

    const jobDir = path.resolve(envConfig.TEMP_DIRECTORY, currentJobId)
    await fs.mkdir(jobDir, { recursive: true })

    const processPromise = (async () => {
      const updateStatusSafe = async (newState: JobState, progress?: { completed: number, total: number }) => {
        const current = await this.jobStoreService.getTableJobStatusMeta(currentJobId)
        if (current?.cancellationFlag) {
          throw new Error('CANCELLED')
        }
        await this.jobStoreService.saveTableJobStatusMeta(currentJobId, {
          status: newState,
          progress: progress || current?.progress || { completed: 0, total: 0 },
          cancellationFlag: false,
          createdAt: current?.createdAt,
        })
      }

      const initialCheck = await this.jobStoreService.getTableJobStatusMeta(currentJobId)
      if (initialCheck?.cancellationFlag) {
        throw new Error('CANCELLED')
      }

      await updateStatusSafe(JobState.SPLITTING)

      let processedBuffer = await fs.readFile(filePath)
      let currentExt = path.extname(filePath).replace('.', '').toLowerCase()

      const pagesPdfBytes: Buffer[] = []

      if (currentExt === 'pdf') {
        const pdf = await PDFDocument.load(processedBuffer)
        const totalPages = pdf.getPageCount()
        if (totalPages > envConfig.MAX_PDF_PAGES) {
          throw new Error(`Số trang PDF (${totalPages}) vượt quá giới hạn tối đa cho phép (${envConfig.MAX_PDF_PAGES})`)
        }
        for (let i = 0; i < totalPages; i++) {
          const newPdf = await PDFDocument.create()
          const [page] = await newPdf.copyPages(pdf, [i])
          newPdf.addPage(page)
          const bytes = await newPdf.save()
          pagesPdfBytes.push(Buffer.from(bytes))
        }
      } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(currentExt)) {
        const image = sharp(processedBuffer)
        const metadata = await image.metadata()
        const width = metadata.width ?? 600
        const height = metadata.height ?? 800

        const pngBuffer = await image.png().toBuffer()

        const pdfDoc = await PDFDocument.create()
        const page = pdfDoc.addPage([width, height])
        const embeddedImage = await pdfDoc.embedPng(pngBuffer)

        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: width,
          height: height,
        })

        const pdfBytes = await pdfDoc.save()
        pagesPdfBytes.push(Buffer.from(pdfBytes))
      } else {
        throw new Error(`Định dạng file không hỗ trợ: ${currentExt}`)
      }

      const totalPagesCount = pagesPdfBytes.length
      await updateStatusSafe(JobState.OCR_PROCESSING, { completed: 0, total: totalPagesCount })

      await this.resultStorage.deleteResults(currentJobId).catch(() => {})

      const limit = pLimit(envConfig.VISION_CONCURRENCY)
      let completedCount = 0
      let lastProgressTime = Date.now()
      let lastProgressPercent = 0

      const updateProgressThrottled = async (completed: number, total: number) => {
        const now = Date.now()
        const percent = Math.floor((completed / total) * 100)
        const timeElapsed = now - lastProgressTime
        const percentIncreased = percent - lastProgressPercent

        if (timeElapsed >= 2000 || percentIncreased >= 5 || completed === total) {
          lastProgressTime = now
          lastProgressPercent = percent
          
          try {
            const current = await this.jobStoreService.getTableJobStatusMeta(currentJobId)
            if (current?.cancellationFlag) {
              throw new Error('CANCELLED')
            }
            await this.jobStoreService.saveTableJobStatusMeta(currentJobId, {
              status: JobState.OCR_PROCESSING,
              progress: { completed, total },
              cancellationFlag: false,
              createdAt: current?.createdAt,
            })
          } catch (redisErr: any) {
            if (redisErr.message === 'CANCELLED') {
              throw redisErr
            }
            this.logger.warn(`[Job ${currentJobId}] Lỗi cập nhật tiến độ Redis: ${redisErr.message}`)
          }
        }
      }

      const tasks = pagesPdfBytes.map(async (pagePdf, index) => {
        const pageNum = index + 1
        return limit(async () => {
          const status = await this.jobStoreService.getTableJobStatusMeta(currentJobId)
          if (status?.cancellationFlag) {
            throw new Error('CANCELLED')
          }

          const result = await this.concurrencyService.runPage(() =>
            this.concurrencyService.runGlobal(async () => {
              return this.documentAiService.extractTableFromPage({
                file_bytes: pagePdf,
                pageIndex: index,
                mimeType: 'application/pdf',
              })
            })
          )

          const statusAfter = await this.jobStoreService.getTableJobStatusMeta(currentJobId)
          if (statusAfter?.cancellationFlag) {
            throw new Error('CANCELLED')
          }

          await this.resultStorage.appendPageResult(currentJobId, attemptToken, result)

          completedCount++
          await updateProgressThrottled(completedCount, totalPagesCount)

          this.logger.log(JSON.stringify({
            jobId: currentJobId,
            attemptToken,
            queue: TABLE_PROCESS_QUEUE_NAME,
            worker: TableProcessProcessor.name,
            page: pageNum,
            status: 'page_processed',
            ramUsage: process.memoryUsage().heapUsed,
            cpuUsage: process.cpuUsage().user,
          }))

          return result
        })
      })

      const completedPages = await Promise.all(tasks)
      
      await updateStatusSafe(JobState.SAVING_RESULTS, { completed: totalPagesCount, total: totalPagesCount })

      await this.resultStorage.promoteResults(currentJobId, attemptToken)

      const finalCheck = await this.jobStoreService.getTableJobStatusMeta(currentJobId)
      await this.jobStoreService.saveTableJobStatusMeta(currentJobId, {
        status: JobState.COMPLETED,
        progress: { completed: totalPagesCount, total: totalPagesCount },
        cancellationFlag: false,
        createdAt: finalCheck?.createdAt,
        completedAt: new Date().toISOString(),
      })

      this.logger.log(`[Job ${currentJobId}] Trích xuất bảng thành công. Đang lập lịch dọn dẹp workspace.`)

      await this.cleanupQueue.add('table-cleanup-job', { jobId: currentJobId }, {
        delay: envConfig.OCR_CLEANUP_TTL_MS,
        attempts: 10,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      })

      this.logger.log(JSON.stringify({
        jobId: currentJobId,
        attemptToken,
        queue: TABLE_PROCESS_QUEUE_NAME,
        worker: TableProcessProcessor.name,
        duration: Date.now() - startTime,
        status: 'success',
        ramUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage().user,
      }))
    })()

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR_JOB_TIMEOUT')), envConfig.OCR_JOB_TIMEOUT)
    )

    try {
      await Promise.race([processPromise, timeoutPromise])
    } catch (err: any) {
      const isCancellation = err.message === 'CANCELLED'

      if (isCancellation) {
        await this.jobStoreService.saveTableJobStatusMeta(currentJobId, {
          status: JobState.CANCELLED,
          progress: typeof job.progress === 'object' && job.progress !== null
            ? (job.progress as { completed: number; total: number })
            : { completed: 0, total: 0 },
          cancellationFlag: true,
        }).catch(() => {})
      } else {
        await this.jobStoreService.saveTableJobStatusMeta(currentJobId, {
          status: JobState.FAILED,
          progress: typeof job.progress === 'object' && job.progress !== null
            ? (job.progress as { completed: number; total: number })
            : { completed: 0, total: 0 },
          failedReason: err.message || String(err),
        }).catch(() => {})
      }

      await this.resultStorage.deleteResults(currentJobId).catch(() => {})

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
        attemptToken,
        queue: TABLE_PROCESS_QUEUE_NAME,
        worker: TableProcessProcessor.name,
        duration: Date.now() - startTime,
        status: isCancellation ? 'cancelled' : 'failed',
        errorCode: isCancellation ? 'CANCELLED' : 'PROCESSING_ERROR',
        error: err.message,
      }))

      throw err
    }
  }
}
