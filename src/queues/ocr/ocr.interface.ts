export interface OcrJobData {
  batchId: string
  fileIndex: number
  fileName: string
  filePath: string
  mimeType: string
  totalPages: number
  attemptToken?: string // optional, generated on execution
}

export enum JobState {
  QUEUED = 'queued',
  CONVERTING = 'converting',
  SPLITTING = 'splitting',
  OCR_PROCESSING = 'ocr_processing',
  SAVING_RESULTS = 'saving_results',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface OcrPageResult {
  pageNumber: number
  text: string
  confidence: number
}

export interface OcrJobResult {
  pages: OcrPageResult[]
}
