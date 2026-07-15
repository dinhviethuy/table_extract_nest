import { z } from 'zod'

export const CellSchema = z.object({
  colIndex: z.number(),
  text: z.string().trim().optional(),
  colSpan: z.number().default(1),
  rowSpan: z.number().default(1),
})

export const RowSchema = z.object({
  rowIndex: z.number(),
  cells: z.array(CellSchema),
})

export const TableSchema = z.object({
  tableIndex: z.number(),
  rows: z.array(RowSchema),
})

export const PageSchema = z.object({
  pageNumber: z.number(),
  tables: z.array(TableSchema),
  error: z.string().optional(),
})

export const ExtractionResponseSchema = z.object({
  documentName: z.string(),
  totalPages: z.number(),
  pages: z.array(PageSchema),
})

export const TableBatchFileMetadataSchema = z.object({
  fileIndex: z.number(),
  jobId: z.string(),
  fileName: z.string(),
  totalPages: z.number(),
  status: z.string(),
})

export const TableBatchResponseSchema = z.object({
  batchId: z.string(),
  files: z.array(TableBatchFileMetadataSchema),
})

export const TableFileResultSchema = z.object({
  fileIndex: z.number(),
  jobId: z.string(),
  fileName: z.string(),
  status: z.string(),
  totalPages: z.number(),
  completedPages: z.number(),
  pages: z.array(PageSchema),
  tablePageNumbers: z.array(z.number()).optional(),
  failedReason: z.string().optional(),
})

export const TableBatchStatusSchema = z.object({
  batchId: z.string(),
  status: z.string(),
  totalFiles: z.number(),
  completedFiles: z.number(),
  files: z.array(TableFileResultSchema),
})

export type CellSchemaType = z.infer<typeof CellSchema>
export type RowSchemaType = z.infer<typeof RowSchema>
export type TableSchemaType = z.infer<typeof TableSchema>
export type PageSchemaType = z.infer<typeof PageSchema>
export type ExtractionResponseSchemaType = z.infer<typeof ExtractionResponseSchema>
export type TableBatchResponseType = z.infer<typeof TableBatchResponseSchema>
export type TableBatchStatusType = z.infer<typeof TableBatchStatusSchema>
export type TableFileResultType = z.infer<typeof TableFileResultSchema>

