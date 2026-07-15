import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import * as fs from 'fs/promises'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { convertToPdf } from '../../shared/utils/helper'
import { GoogleVisionService } from '../../shared/services/google-vision.service'
import { ConcurrencyService } from '../../shared/services/concurrency.service'
import { OcrJobData } from './ocr.interface'
import { OCR_QUEUE_NAME } from '../../shared/constants/ocr.constant'

@Injectable()
@Processor(OCR_QUEUE_NAME)
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name)

  constructor(
    private readonly googleVisionService: GoogleVisionService,
    private readonly concurrencyService: ConcurrencyService,
  ) {
    super()
  }

  async process(job: Job<OcrJobData>): Promise<{ pages: { pageNumber: number; text: string; confidence: number }[] }> {
    const { filePath, fileName, mimeType } = job.data
    this.logger.log(`Bắt đầu xử lý OCR cho file: ${fileName} (jobId: ${job.id})`)

    let fileBuffer: Buffer
    try {
      fileBuffer = await fs.readFile(filePath)
    } catch (err) {
      this.logger.error(`Không thể đọc file tại đường dẫn: ${filePath}`, err)
      throw new Error(`Không thể tìm thấy file để xử lý: ${fileName}`)
    }

    let ext = path.extname(fileName).replace('.', '').toLowerCase()
    let processedBuffer = fileBuffer
    let tempPdfPath: string | null = null

    try {
      // 1. Convert Word to PDF if needed
      if (['doc', 'docx'].includes(ext)) {
        const tempDir = path.join(process.cwd(), 'temp')
        await fs.mkdir(tempDir, { recursive: true })
        const tempDocxPath = path.join(tempDir, `${job.id}.${ext}`)
        tempPdfPath = path.join(tempDir, `${job.id}.pdf`)

        await fs.writeFile(tempDocxPath, fileBuffer)
        try {
          await convertToPdf({ docxPath: tempDocxPath, pdfPath: tempPdfPath })
          processedBuffer = await fs.readFile(tempPdfPath)
          ext = 'pdf'
        } finally {
          await fs.rm(tempDocxPath, { force: true })
        }
      }

      // 2. Prepare page buffers
      const pagesData: { buffer: Buffer; isPdf: boolean }[] = []

      if (ext === 'pdf') {
        const pdf = await PDFDocument.load(processedBuffer)
        const totalPages = pdf.getPageCount()
        for (let i = 0; i < totalPages; i++) {
          const newPdf = await PDFDocument.create()
          const [page] = await newPdf.copyPages(pdf, [i])
          newPdf.addPage(page)
          const bytes = await newPdf.save()
          pagesData.push({
            buffer: Buffer.from(bytes),
            isPdf: true,
          })
        }
      } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext)) {
        pagesData.push({
          buffer: processedBuffer,
          isPdf: false,
        })
      } else {
        throw new Error(`Định dạng file không được hỗ trợ: ${ext}`)
      }

      const totalPagesCount = pagesData.length
      let completedCount = 0
      await job.updateProgress({ completed: 0, total: totalPagesCount })

      // 3. Process pages with concurrency limit
      const tasks = pagesData.map(async (pageData, index) => {
        const pageNum = index + 1
        
        const result = await this.concurrencyService.runPage(() =>
          this.concurrencyService.runGlobal(async () => {
            if (pageData.isPdf) {
              return this.googleVisionService.extractTextFromPdfPage(pageData.buffer)
            } else {
              return this.googleVisionService.extractTextFromImagePage(pageData.buffer)
            }
          })
        )

        completedCount++
        await job.updateProgress({ completed: completedCount, total: totalPagesCount }).catch(() => {})

        return {
          pageNumber: pageNum,
          ...result,
        }
      })

      const pageResults = await Promise.all(tasks)
      pageResults.sort((a, b) => a.pageNumber - b.pageNumber)

      this.logger.log(`Hoàn thành OCR cho file: ${fileName} (${pageResults.length} trang)`)
      return {
        pages: pageResults,
      }
    } finally {
      // 4. Cleanup temp PDF conversion file
      if (tempPdfPath) {
        await fs.rm(tempPdfPath, { force: true }).catch(() => {})
      }
      // 5. Cleanup original upload file from uploads folder
      await fs.rm(filePath, { force: true }).catch(() => {})
    }
  }
}
