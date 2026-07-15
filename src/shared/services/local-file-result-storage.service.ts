import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs/promises'
import * as path from 'path'
import envConfig from '../configs/env'
import { OcrPageResult, ResultStorage } from '../interfaces/result-storage.interface'

@Injectable()
export class LocalFileResultStorageService implements ResultStorage {
  private readonly logger = new Logger(LocalFileResultStorageService.name)
  private readonly resultsDir = path.resolve(envConfig.TEMP_DIRECTORY, 'results')
  private readonly writeQueues = new Map<string, Promise<void>>()

  constructor() {
    this.ensureDirectoryExists()
  }

  private async ensureDirectoryExists() {
    try {
      await fs.mkdir(this.resultsDir, { recursive: true })
    } catch (err) {
      this.logger.error(`Không thể tạo thư mục lưu kết quả tại ${this.resultsDir}`, err)
    }
  }

  private getAttemptFilePath(jobId: string, attemptToken: string): string {
    return path.join(this.resultsDir, `${jobId}_${attemptToken}.jsonl`)
  }

  private getFinalFilePath(jobId: string): string {
    return path.join(this.resultsDir, `${jobId}.jsonl`)
  }

  async appendPageResult(jobId: string, attemptToken: string, page: any): Promise<void> {
    const key = `${jobId}_${attemptToken}`
    const previousPromise = this.writeQueues.get(key) || Promise.resolve()

    const newPromise = previousPromise.then(async () => {
      const filePath = this.getAttemptFilePath(jobId, attemptToken)
      const dataLine = JSON.stringify(page) + '\n'
      await fs.appendFile(filePath, dataLine, 'utf8')
    })

    this.writeQueues.set(key, newPromise)

    // Dọn dẹp hàng đợi promise để tránh rò rỉ bộ nhớ (memory leaks)
    newPromise.catch(() => {}).then(() => {
      if (this.writeQueues.get(key) === newPromise) {
        this.writeQueues.delete(key)
      }
    })

    return newPromise
  }

  async promoteResults(jobId: string, attemptToken: string): Promise<void> {
    const attemptPath = this.getAttemptFilePath(jobId, attemptToken)
    const finalPath = this.getFinalFilePath(jobId)

    try {
      // Thực hiện đổi tên nguyên tử (atomic rename)
      await fs.rename(attemptPath, finalPath)
    } catch (err: any) {
      // Xử lý lỗi EXDEV khi đổi tên giữa các ổ đĩa/thiết bị khác nhau
      if (err.code === 'EXDEV') {
        this.logger.warn(`Phát hiện liên kết khác phân vùng (EXDEV), chuyển sang cơ chế copy-sync-rename cho jobId ${jobId}`)
        const tempPath = `${finalPath}.tmp`
        
        // Sao chép nội dung tệp
        await fs.copyFile(attemptPath, tempPath)
        
        // Đồng bộ file descriptor (fsync) để đảm bảo dữ liệu ghi thành công xuống đĩa
        const fileHandle = await fs.open(tempPath, 'r+')
        try {
          await fileHandle.sync()
        } finally {
          await fileHandle.close()
        }

        // Đổi tên nguyên tử file tmp thành file đích
        await fs.rename(tempPath, finalPath)
        
        // Xoá tệp attempt nguồn
        await fs.unlink(attemptPath).catch(() => {})
      } else {
        this.logger.error(`Thăng hạng kết quả thất bại cho jobId ${jobId}`, err)
        throw err
      }
    }
  }

  async getResults(jobId: string): Promise<any[]> {
    const filePath = this.getFinalFilePath(jobId)
    try {
      const content = await fs.readFile(filePath, 'utf8')
      const lines = content.split('\n')
      const results: any[] = []

      // Loại bỏ dòng trống cuối cùng nếu có
      const activeLines = lines.filter((line, idx) => {
        if (idx === lines.length - 1 && line.trim() === '') {
          return false
        }
        return true
      })

      for (let i = 0; i < activeLines.length; i++) {
        const line = activeLines[i]
        if (line.trim() === '') continue

        try {
          const parsed = JSON.parse(line) as OcrPageResult
          results.push(parsed)
        } catch (jsonErr) {
          // Bỏ qua dòng cuối cùng nếu bị dở dang (ví dụ do sập nguồn/crash worker)
          const isLastLine = i === activeLines.length - 1
          if (isLastLine) {
            this.logger.warn(`Bỏ qua dòng JSONL cuối cùng bị thiếu dữ liệu tại file ${filePath}: ${line}`)
          } else {
            this.logger.error(`Lỗi phân tích JSONL ở giữa file ${filePath} tại dòng ${i + 1}`)
            throw jsonErr
          }
        }
      }

      // Sắp xếp tăng dần theo số trang
      return results.sort((a, b) => a.pageNumber - b.pageNumber)
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return []
      }
      throw err
    }
  }

  async deleteResults(jobId: string): Promise<void> {
    const finalPath = this.getFinalFilePath(jobId)
    await fs.unlink(finalPath).catch(() => {})

    try {
      const files = await fs.readdir(this.resultsDir)
      const prefix = `${jobId}_`
      for (const file of files) {
        if (file.startsWith(prefix) && file.endsWith('.jsonl')) {
          const attemptFilePath = path.join(this.resultsDir, file)
          await fs.unlink(attemptFilePath).catch(() => {})
        }
      }
    } catch (err) {
      // Bỏ qua lỗi đọc thư mục
    }
  }
}
