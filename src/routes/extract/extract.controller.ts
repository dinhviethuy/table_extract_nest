import {
  Controller,
  FileTypeValidator,
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
import { ExtractionResponseSchema } from './extract.schema'
import { ExtractService } from './extract.service'

@Controller('extract')
export class ExtractController {
  constructor(private readonly extractService: ExtractService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(ExtractionResponseSchema)
  extractTable(
    @UploadedFiles(
      new ParseFilePipeWithUnlink({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1 * 1024 * 1024 }), // 1MB
          new FileTypeValidator({ fileType: /\.(jpg|jpeg|png|webp|pdf|doc|docx)$/i }), // chỉ cho phép các định dạng này
        ],
      }),
    )
    files: Array<Express.Multer.File>,
  ) {
    return this.extractService.extractTable(files)
  }
}
