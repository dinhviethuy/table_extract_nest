import {
  Controller,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ZodSerializerDto } from 'nestjs-zod'
import { ParseFilePipeWithUnlink } from 'src/shared/pipes/parse-file-pipe-with-unlink.pipe'
import { CustomFileTypeValidator } from 'src/shared/pipes/custom-file-type.validator'
import { ExtractionResponseSchema } from './extract-tables.schema'
import { ExtractTablesService } from './extract-tables.service'

@Controller('extract-tables')
export class ExtractTablesController {
  constructor(private readonly extractService: ExtractTablesService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(ExtractionResponseSchema)
  extractTable(
    @UploadedFiles(
      new ParseFilePipeWithUnlink({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // Tăng lên 10MB cho file tài liệu pdf/doc
          new CustomFileTypeValidator({ fileType: /(jpg|jpeg|png|webp|bmp|tiff|pdf|msword|word|document)$/i }), // Cho phép ảnh, pdf, doc, docx
        ],
      }),
    )
    files: Array<Express.Multer.File>,
  ) {
    return this.extractService.extractTable(files)
  }
}
