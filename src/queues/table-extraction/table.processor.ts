import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import * as fs from 'fs/promises'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { convertToPdf } from '../../shared/utils/helper'
import { DocumentAiService } from '../../shared/services/document-ai.service'
import { ConcurrencyService } from '../../shared/services/concurrency.service'
import { TABLE_QUEUE_NAME } from '../../shared/constants/ocr.constant'
import { TableJobData } from './table-extraction.interface'

@Injectable()
@Processor(TABLE_QUEUE_NAME)
export class TableProcessor extends WorkerHost {
  private readonly logger = new Logger(TableProcessor.name)

  constructor(
    private readonly documentAiService: DocumentAiService,
    private readonly concurrencyService: ConcurrencyService,
  ) {
    super()
  }

  async process(job: Job<TableJobData>): Promise<{ pages: any[] }> {
    const { filePath, fileName } = job.data
    this.logger.log(`Bắt đầu xử lý trích xuất bảng cho file: ${fileName} (jobId: ${job.id})`)

    let fileBuffer: Buffer
    try {
      fileBuffer = await fs.readFile(filePath)
    } catch (err) {
      this.logger.error(`Không thể đọc file tại: ${filePath}`, err)
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
      const pagesPdfBytes: Buffer[] = []

      if (ext === 'pdf') {
        const pdf = await PDFDocument.load(processedBuffer)
        const totalPages = pdf.getPageCount()
        for (let i = 0; i < totalPages; i++) {
          const newPdf = await PDFDocument.create()
          const [page] = await newPdf.copyPages(pdf, [i])
          newPdf.addPage(page)
          const bytes = await newPdf.save()
          pagesPdfBytes.push(Buffer.from(bytes))
        }
      } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext)) {
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
        throw new Error(`Định dạng file không hỗ trợ: ${ext}`)
      }

      const totalPagesCount = pagesPdfBytes.length
      let completedCount = 0
      await job.updateProgress({ completed: 0, total: totalPagesCount })

      // 3. Process pages through Document AI with concurrency limit
      const tasks = pagesPdfBytes.map(async (pagePdf, index) => {
        const result = await this.concurrencyService.runPage(() =>
          this.concurrencyService.runGlobal(async () => {
            return this.documentAiService.extractTableFromPage({
              file_bytes: pagePdf,
              pageIndex: index,
              mimeType: 'application/pdf',
            })
          })
        )

        completedCount++
        await job.updateProgress({ completed: completedCount, total: totalPagesCount }).catch(() => {})

        return result
      })

      const completedPages = await Promise.all(tasks)
      completedPages.sort((a, b) => a.pageNumber - b.pageNumber)

      // Filter pages containing tables or errors
      const filteredPages = completedPages.filter((page) => page.tables.length > 0 || page.error !== undefined)

      this.logger.log(`Hoàn thành trích xuất bảng cho file: ${fileName}`)
      return {
        pages: filteredPages,
      }
    } finally {
      // 4. Cleanup temp PDF conversion files
      if (tempPdfPath) {
        await fs.rm(tempPdfPath, { force: true }).catch(() => {})
      }
      // 5. Cleanup original upload file from uploads folder
      await fs.rm(filePath, { force: true }).catch(() => {})
    }
  }
}
