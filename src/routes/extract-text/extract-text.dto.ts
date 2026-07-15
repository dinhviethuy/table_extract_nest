import { createZodDto } from 'nestjs-zod'
import {
  OcrBatchResponseSchema,
  OcrBatchStatusSchema,
  OcrFileDetailResponseSchema,
  OcrPageDetailResponseSchema,
} from './extract-text.schema'

export class OcrBatchResponseDto extends createZodDto(OcrBatchResponseSchema) {}
export class OcrBatchStatusDto extends createZodDto(OcrBatchStatusSchema) {}
export class OcrFileDetailResponseDto extends createZodDto(OcrFileDetailResponseSchema) {}
export class OcrPageDetailResponseDto extends createZodDto(OcrPageDetailResponseSchema) {}
