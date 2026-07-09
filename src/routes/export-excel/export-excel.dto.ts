import { createZodDto } from 'nestjs-zod'
import {
  ClientMergeRangeSchema,
  ClientTableItemSchema,
  ExportOptionsSchema,
  ExportRequestSchema,
} from './export-excel.schema'

export class ClientMergeRangeDto extends createZodDto(ClientMergeRangeSchema) {}
export class ClientTableItemDto extends createZodDto(ClientTableItemSchema) {}
export class ExportOptionsDto extends createZodDto(ExportOptionsSchema) {}
export class ExportRequestDto extends createZodDto(ExportRequestSchema) {}
