import { z } from 'zod'

export const ClientMergeRangeSchema = z.object({
  startRow: z.number(),
  startCol: z.number(),
  endRow: z.number(),
  endCol: z.number(),
})

export const ClientTableItemSchema = z.object({
  tableName: z.string().optional().nullable(),
  headers: z.array(z.any()).default([]),
  rows: z.array(z.array(z.string())).default([]),
  merges: z.array(ClientMergeRangeSchema).optional().nullable(),
  headerRows: z.array(z.number()).optional().nullable(),
})

export const ExportOptionsSchema = z.object({
  zip: z.boolean().default(false).optional(),
  verticalMerge: z.boolean().default(false).optional(),
})

export const ExportRequestSchema = z.object({
  tables: z.array(ClientTableItemSchema),
  options: ExportOptionsSchema.optional().nullable(),
})

export type ClientMergeRangeSchemaType = z.infer<typeof ClientMergeRangeSchema>
export type ClientTableItemSchemaType = z.infer<typeof ClientTableItemSchema>
export type ExportOptionsSchemaType = z.infer<typeof ExportOptionsSchema>
export type ExportRequestSchemaType = z.infer<typeof ExportRequestSchema>
