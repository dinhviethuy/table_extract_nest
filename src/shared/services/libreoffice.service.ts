import { Injectable, Logger } from '@nestjs/common'
import { execFile } from 'child_process'
import pLimit from 'p-limit'
import * as path from 'path'
import { promisify } from 'util'
import envConfig from '../configs/env'

const execFileAsync = promisify(execFile)

@Injectable()
export class LibreOfficeService {
  private readonly logger = new Logger(LibreOfficeService.name)
  private readonly limiter = pLimit(envConfig.LIBREOFFICE_CONCURRENCY)
  private readonly sofficePath = envConfig.LIBRE_OFFICE_EXE || 'soffice'

  async convertToPdf(docxPath: string, outDir: string): Promise<string> {
    const normalizedDocxPath = path.resolve(docxPath)
    const normalizedOutDir = path.resolve(outDir)

    return this.limiter(async () => {
      this.logger.log(`Bắt đầu chuyển đổi Word sang PDF cho tệp: ${docxPath}`)
      const startTime = Date.now()
      try {
        await execFileAsync(this.sofficePath, [
          '--headless',
          '--convert-to', 'pdf',
          '--outdir', normalizedOutDir,
          normalizedDocxPath
        ])

        const ext = path.extname(normalizedDocxPath)
        const baseName = path.basename(normalizedDocxPath, ext)
        const pdfPath = path.join(normalizedOutDir, `${baseName}.pdf`)
        
        this.logger.log(`Chuyển đổi Word sang PDF thành công trong ${Date.now() - startTime}ms. File đích: ${pdfPath}`)
        return pdfPath
      } catch (err: any) {
        this.logger.error(`Chuyển đổi Word sang PDF thất bại cho tệp: ${docxPath}`, err)
        throw new Error(`Lỗi chuyển đổi Word sang PDF: ${err.message}`)
      }
    })
  }
}
