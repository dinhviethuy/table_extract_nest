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
  OcrBatchResponseDto,
  OcrBatchStatusDto,
  OcrFileDetailResponseDto,
  OcrPageDetailResponseDto,
} from './extract-text.dto'
import { ExtractTextService } from './extract-text.service'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

@Controller('extract-text')
export class ExtractTextController {
  constructor(private readonly extractTextService: ExtractTextService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files'))
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(OcrBatchResponseDto)
  extractText(
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
    return this.extractTextService.createBatch(files)
  }

  @Get(':batchId')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(OcrBatchStatusDto)
  getBatchStatus(
    @Param('batchId') batchId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : undefined
    const limit = pageSize ? parseInt(pageSize, 10) : undefined
    return this.extractTextService.getBatchStatus(batchId, pageNum, limit)
  }

  @Get(':batchId/files/:fileIndex')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(OcrFileDetailResponseDto)
  getFileDetail(
    @Param('batchId') batchId: string,
    @Param('fileIndex', ParseIntPipe) fileIndex: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1
    const limit = pageSize ? parseInt(pageSize, 10) : 10
    return this.extractTextService.getFileDetail(batchId, fileIndex, pageNum, limit)
  }

  @Get(':batchId/files/:fileIndex/pages/:pageNumber')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(OcrPageDetailResponseDto)
  getPageDetail(
    @Param('batchId') batchId: string,
    @Param('fileIndex', ParseIntPipe) fileIndex: number,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
  ) {
    return this.extractTextService.getPageDetail(batchId, fileIndex, pageNumber)
  }

  @Sse(':batchId/stream')
  streamProgress(@Param('batchId') batchId: string): Observable<MessageEvent> {
    return this.extractTextService.streamBatchProgress(batchId).pipe(
      map((event) => ({ data: event.data } as MessageEvent))
    )
  }
}
