import {
  Controller,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Post,
  Get,
  Param,
  Query,
  UploadedFiles,
  UseInterceptors,
  Sse,
  MessageEvent,
  ParseIntPipe,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ZodSerializerDto } from 'nestjs-zod'
import { ParseFilePipeWithUnlink } from '../../shared/pipes/parse-file-pipe-with-unlink.pipe'
import { CustomFileTypeValidator } from '../../shared/pipes/custom-file-type.validator'
import {
  TableBatchResponseDto,
  TableBatchStatusDto,
  PageDto,
  TableFileResultDto,
} from './extract-tables.dto'
import { ExtractTablesService } from './extract-tables.service'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import envConfig from '../../shared/configs/env'

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
          new MaxFileSizeValidator({ maxSize: envConfig.MAX_UPLOAD_SIZE }), // Config-driven upload limit
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
  getBatchStatus(
    @Param('batchId') batchId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : undefined
    const limit = pageSize ? parseInt(pageSize, 10) : undefined
    return this.extractService.getBatchStatus(batchId, pageNum, limit)
  }

  @Get(':batchId/files/:fileIndex')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(TableFileResultDto)
  getFileDetail(
    @Param('batchId') batchId: string,
    @Param('fileIndex', ParseIntPipe) fileIndex: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1
    const limit = pageSize ? parseInt(pageSize, 10) : 10
    return this.extractService.getFileDetail(batchId, fileIndex, pageNum, limit)
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

  @Sse(':batchId/stream')
  streamProgress(@Param('batchId') batchId: string): Observable<MessageEvent> {
    return this.extractService.streamBatchProgress(batchId).pipe(
      map((event) => ({ data: event.data } as MessageEvent))
    )
  }
}
