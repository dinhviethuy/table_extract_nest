export interface BatchFileMetadata {
  fileIndex: number
  jobId: string
  fileName: string
  totalPages: number
  status: string
}

export interface BatchMetadata {
  batchId: string
  createdAt: string
  files: BatchFileMetadata[]
}
