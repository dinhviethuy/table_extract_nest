import { createZodDto } from 'nestjs-zod'
import { CellSchema, ExtractionResponseSchema, PageSchema, RowSchema, TableSchema } from './extract.schema'

export class ExtractionResponseDto extends createZodDto(ExtractionResponseSchema) {}
export class PageDto extends createZodDto(PageSchema) {}
export class TableDto extends createZodDto(TableSchema) {}
export class RowDto extends createZodDto(RowSchema) {}
export class CellDto extends createZodDto(CellSchema) {}
