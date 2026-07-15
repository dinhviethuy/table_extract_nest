import { Injectable, Logger } from '@nestjs/common'
import { execFile } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

@Injectable()
export class PdfToolService {
  private readonly logger = new Logger(PdfToolService.name)
  private readonly binDir = path.resolve(process.cwd(), 'Release-26.02.0-0', 'poppler-26.02.0', 'Library', 'bin')
  private readonly pdfinfoPath = path.join(this.binDir, 'pdfinfo.exe')
  private readonly pdftoppmPath = path.join(this.binDir, 'pdftoppm.exe')

  async getPageCount(pdfPath: string): Promise<number> {
    const normalizedPdfPath = path.resolve(pdfPath)
    try {
      const { stdout } = await execFileAsync(this.pdfinfoPath, [normalizedPdfPath])
      const lines = stdout.split('\n')
      for (const line of lines) {
        if (line.startsWith('Pages:')) {
          const match = line.match(/Pages:\s+(\d+)/)
          if (match) {
            return parseInt(match[1], 10)
          }
        }
      }
      throw new Error('Không tìm thấy trường "Pages" trong kết quả trả về của pdfinfo')
    } catch (err: any) {
      this.logger.error(`Không thể lấy số trang PDF cho tệp: ${pdfPath}`, err)
      throw new Error(`Phân tích siêu dữ liệu PDF thất bại: ${err.message}`)
    }
  }

  async renderSinglePage(pdfPath: string, pageNumber: number, outputPathPrefix: string): Promise<string> {
    const normalizedPdfPath = path.resolve(pdfPath)
    const normalizedPrefix = path.resolve(outputPathPrefix)
    const parentDir = path.dirname(normalizedPrefix)

    try {
      // Thực thi pdftoppm kết xuất duy nhất một trang chỉ định
      await execFileAsync(this.pdftoppmPath, [
        '-png',
        '-r', '150',
        '-f', pageNumber.toString(),
        '-l', pageNumber.toString(),
        normalizedPdfPath,
        normalizedPrefix
      ])

      // Tìm tệp tin kết quả được sinh ra trong thư mục đích
      const files = await fs.readdir(parentDir)
      const prefixBasename = path.basename(normalizedPrefix)
      
      // pdftoppm tự động gắn thêm hậu tố số trang, tìm tệp tin bắt đầu bằng prefixBasename và kết thúc bằng .png
      for (const file of files) {
        if (file.startsWith(prefixBasename) && file.endsWith('.png')) {
          // Kiểm tra xem số trang có khớp trong hậu tố tên file không
          const pageSuffixMatch = file.match(/-(\d+)\.png$/)
          if (pageSuffixMatch && parseInt(pageSuffixMatch[1], 10) === pageNumber) {
            return path.join(parentDir, file)
          }
        }
      }

      throw new Error(`pdftoppm đã chạy hoàn tất nhưng không tìm thấy tệp ảnh kết quả cho trang ${pageNumber}`)
    } catch (err: any) {
      this.logger.error(`Không thể kết xuất trang ${pageNumber} của tệp PDF ${pdfPath}`, err)
      throw new Error(`Kết xuất trang PDF thất bại: ${err.message}`)
    }
  }
}
