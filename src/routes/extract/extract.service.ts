import { BadRequestException, Injectable } from '@nestjs/common'
import * as fs from 'fs/promises'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { DocumentAiService } from '../../shared/services/document-ai.service'
import { convertToPdf } from '../../shared/utils/helper'
import { ExtractionResponseSchemaType } from './extract.schema'

@Injectable()
export class ExtractService {
  constructor(private readonly documentAiService: DocumentAiService) {}
  private async processFile(file: Express.Multer.File) {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
    let ext = path.extname(originalName).replace('.', '').toLowerCase()
    const fileName = path.parse(originalName).name
    let fileBuffer = file.buffer
    const isDiskStorage = !fileBuffer && !!file.path
    try {
      if (isDiskStorage) {
        fileBuffer = await fs.readFile(file.path)
      }
      if (['doc', 'docx'].includes(ext)) {
        const tempDir = path.join(process.cwd(), 'temp')
        await fs.mkdir(tempDir, {
          recursive: true,
        })
        const id = uuidv4()
        const docxPath = path.join(tempDir, `${id}.${ext}`)
        const pdfPath = path.join(tempDir, `${id}.pdf`)
        try {
          await fs.writeFile(docxPath, fileBuffer)
          await convertToPdf({
            docxPath,
            pdfPath,
          })
          fileBuffer = await fs.readFile(pdfPath)
          ext = 'pdf'
        } finally {
          await fs.rm(docxPath, { force: true })
          await fs.rm(pdfPath, { force: true })
        }
      }

      const pagesPdfBytes: Buffer[] = []
      let totalPages = 0
      if (ext === 'pdf') {
        // Cắt PDF thành từng trang
        const pdf = await PDFDocument.load(fileBuffer)
        totalPages = pdf.getPageCount()
        for (let i = 0; i < totalPages; i++) {
          const newPdf = await PDFDocument.create()
          const [page] = await newPdf.copyPages(pdf, [i])
          newPdf.addPage(page)
          const bytes = await newPdf.save()
          pagesPdfBytes.push(Buffer.from(bytes))
        }
      } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext)) {
        totalPages = 1
        // Chuyển ảnh -> PDF
        const image = sharp(fileBuffer)
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
        return {
          fileName,
          pagesPdfBytes,
        }
      }
      if (pagesPdfBytes.length === 0) {
        throw new BadRequestException('Không tìm thấy nội dung hợp lệ trong file. Vui lòng upload lại file.')
      }
      return {
        fileName,
        pagesPdfBytes,
        totalPages,
      }
    } finally {
      if (isDiskStorage) {
        await fs.rm(file.path, { force: true }).catch(() => {})
      }
    }
  }

  async extractTable(files: Array<Express.Multer.File>): Promise<ExtractionResponseSchemaType> {
    if (!files?.length) {
      throw new BadRequestException('Không có file nào được upload')
    }
    try {
      const { fileName, pagesPdfBytes, totalPages } = await this.processFile(files[0])
      const tasks = pagesPdfBytes.map((pagePdf, index) =>
        this.documentAiService.extractTableFromPage({
          file_bytes: pagePdf,
          pageIndex: index,
          mimeType: 'application/pdf',
        }),
      )

      const completedPages = await Promise.all(tasks)
      completedPages.sort((a, b) => a.pageNumber - b.pageNumber)
      const filteredPages = completedPages.filter((page) => page.tables.length > 0 || page.error !== undefined)
      return {
        documentName: fileName,
        pages: filteredPages,
        totalPages: totalPages ?? 0,
      }
    } finally {
      for (const file of files) {
        if (file.path) {
          await fs.rm(file.path, { force: true }).catch(() => {})
        }
      }
    }
  }
}
