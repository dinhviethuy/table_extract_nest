import { createZodDto } from 'nestjs-zod'
import {
  CellSchema,
  ExtractionResponseSchema,
  PageSchema,
  RowSchema,
  TableSchema,
  TableBatchResponseSchema,
  TableBatchStatusSchema,
} from './extract-tables.schema'

export class ExtractionResponseDto extends createZodDto(ExtractionResponseSchema) {}
export class PageDto extends createZodDto(PageSchema) {}
export class TableDto extends createZodDto(TableSchema) {}
export class RowDto extends createZodDto(RowSchema) {}
export class CellDto extends createZodDto(CellSchema) {}
export class TableBatchResponseDto extends createZodDto(TableBatchResponseSchema) {}
export class TableBatchStatusDto extends createZodDto(TableBatchStatusSchema) {}

