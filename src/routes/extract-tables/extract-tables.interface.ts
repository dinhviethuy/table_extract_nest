export interface TableBatchFileMetadata {
  fileIndex: number
  jobId: string
  fileName: string
  totalPages: number
  status: string
  tablePageNumbers?: number[]
}

export interface TableBatchMetadata {
  batchId: string
  createdAt: string
  files: TableBatchFileMetadata[]
}
