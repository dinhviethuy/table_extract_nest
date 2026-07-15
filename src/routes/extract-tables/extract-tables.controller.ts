import {
  Controller,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Post,
  Get,
  Param,
  UploadedFiles,
  UseInterceptors,
  ParseIntPipe,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ZodSerializerDto } from 'nestjs-zod'
import { ParseFilePipeWithUnlink } from '../../shared/pipes/parse-file-pipe-with-unlink.pipe'
import { CustomFileTypeValidator } from '../../shared/pipes/custom-file-type.validator'
import { TableBatchResponseDto, TableBatchStatusDto, PageDto } from './extract-tables.dto'
import { ExtractTablesService } from './extract-tables.service'

@Controller('extract-tables')
export class ExtractTablesController {
  constructor(private readonly extractService: ExtractTablesService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files'))
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(TableBatchResponseDto)
  extractTable(
    @UploadedFiles(
      new ParseFilePipeWithUnlink({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }), // 50MB upload limit
          new CustomFileTypeValidator({ fileType: /(jpg|jpeg|png|webp|bmp|tiff|pdf|msword|word|document)$/i }),
        ],
      }),
    )
    files: Array<Express.Multer.File>,
  ) {
    return this.extractService.createBatch(files)
  }

  @Get(':batchId')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(TableBatchStatusDto)
  getBatchStatus(@Param('batchId') batchId: string) {
    return this.extractService.getBatchStatus(batchId)
  }

  @Get(':batchId/files/:fileIndex/pages/:pageNumber')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(PageDto)
  getPageDetail(
    @Param('batchId') batchId: string,
    @Param('fileIndex', ParseIntPipe) fileIndex: number,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
  ) {
    return this.extractService.getPageDetail(batchId, fileIndex, pageNumber)
  }
}

