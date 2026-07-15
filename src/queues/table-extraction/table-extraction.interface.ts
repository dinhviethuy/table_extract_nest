export interface TableJobData {
  batchId: string
  fileIndex: number
  fileName: string
  filePath: string
  mimeType: string
  totalPages: number
}

export interface TableJobResult {
  pages: any[]
}
