export interface OcrJobData {
  batchId: string
  fileIndex: number
  fileName: string
  filePath: string
  mimeType: string
  totalPages: number
}

export interface OcrPageResult {
  pageNumber: number
  text: string
  confidence: number
}

export interface OcrJobResult {
  pages: OcrPageResult[]
}
