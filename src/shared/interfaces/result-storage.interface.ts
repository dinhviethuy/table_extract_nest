export type { OcrPageResult } from '../../queues/ocr/ocr.interface'
import type { OcrPageResult } from '../../queues/ocr/ocr.interface'

export interface ResultStorage {
  appendPageResult(jobId: string, attemptToken: string, page: any): Promise<void>
  promoteResults(jobId: string, attemptToken: string): Promise<void>
  getResults(jobId: string): Promise<any[]>
  deleteResults(jobId: string): Promise<void>
}
