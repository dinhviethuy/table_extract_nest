import { z } from 'zod'

export const OcrPageResultSchema = z.object({
  pageNumber: z.number(),
  text: z.string().trim().optional().default(''),
  confidence: z.number().default(0),
})

export const OcrFileMetadataSchema = z.object({
  fileIndex: z.number(),
  jobId: z.string(),
  fileName: z.string(),
  totalPages: z.number(),
  status: z.string(),
})

export const OcrBatchResponseSchema = z.object({
  batchId: z.string(),
  files: z.array(OcrFileMetadataSchema),
})

export const OcrFileResultSchema = z.object({
  fileIndex: z.number(),
  jobId: z.string(),
  fileName: z.string(),
  status: z.string(),
  totalPages: z.number(),
  completedPages: z.number(),
  pages: z.array(OcrPageResultSchema),
  failedReason: z.string().optional(),
})

export const OcrBatchStatusSchema = z.object({
  batchId: z.string(),
  status: z.string(),
  totalFiles: z.number(),
  completedFiles: z.number(),
  files: z.array(OcrFileResultSchema),
})

export const OcrPaginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  totalResultPages: z.number(),
})

export const OcrFileDetailResponseSchema = z.object({
  fileIndex: z.number(),
  fileName: z.string(),
  status: z.string(),
  totalPages: z.number(),
  completedPages: z.number(),
  pages: z.array(OcrPageResultSchema),
  pagination: OcrPaginationSchema,
  failedReason: z.string().optional(),
})

export const OcrPageDetailResponseSchema = z.object({
  fileIndex: z.number(),
  fileName: z.string(),
  pageNumber: z.number(),
  text: z.string(),
  confidence: z.number(),
})

export type OcrPageResultType = z.infer<typeof OcrPageResultSchema>
export type OcrFileMetadataType = z.infer<typeof OcrFileMetadataSchema>
export type OcrBatchResponseType = z.infer<typeof OcrBatchResponseSchema>
export type OcrFileResultType = z.infer<typeof OcrFileResultSchema>
export type OcrBatchStatusType = z.infer<typeof OcrBatchStatusSchema>
export type OcrFileDetailResponseType = z.infer<typeof OcrFileDetailResponseSchema>
export type OcrPageDetailResponseType = z.infer<typeof OcrPageDetailResponseSchema>
