import { Controller, Post, Body, Res, HttpStatus, HttpException } from '@nestjs/common'
import * as express from 'express'
import { ExportExcelService } from './export-excel.service'
import { ExportRequestDto } from './export-excel.dto'

@Controller('api/export-excel')
export class ExportExcelController {
  constructor(private readonly excelExporterService: ExportExcelService) {}

  @Post()
  async exportExcel(@Body() body: ExportRequestDto, @Res() res: express.Response) {
    try {
      const { tables, options } = body
      if (!tables || tables.length === 0) {
        throw new HttpException('Không có dữ liệu bảng để xuất.', HttpStatus.BAD_REQUEST)
      }

      const { fileBytes, mediaType, filename } = await this.excelExporterService.exportTables(
        tables,
        options || undefined,
      )

      res.setHeader('Content-Type', mediaType)
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(fileBytes)
    } catch (e) {
      if (e instanceof HttpException) {
        throw e
      }
      throw new HttpException(
        `Xuất file Excel thất bại: ${e instanceof Error ? e.message : String(e)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }
}
