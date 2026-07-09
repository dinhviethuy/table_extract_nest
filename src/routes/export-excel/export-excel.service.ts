import { Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {
  applyTableMerges,
  autofitColumnWidths,
  sanitizeFileName,
  sanitizeSheetName,
  writeTableDataToWorksheet,
} from '../../shared/utils/excel/excel-utils'
import { ClientTableItemSchemaType, ExportOptionsSchemaType } from './export-excel.schema'

@Injectable()
export class ExportExcelService {
  private buildWorkbookForTable(table: ClientTableItemSchemaType, idx: number): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook()
    const sheetName = sanitizeSheetName(table.tableName, `Sheet ${idx + 1}`)
    const ws = wb.addWorksheet(sheetName)
    ws.views = [{ showGridLines: true }]

    writeTableDataToWorksheet(ws, table, 1, false)
    applyTableMerges(ws, table.merges, 0, false)
    autofitColumnWidths(ws)

    return wb
  }

  private buildCombinedVerticalWorkbook(tables: ClientTableItemSchemaType[]): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Dữ liệu gộp dọc')
    ws.views = [{ showGridLines: true }]

    const fontTitle = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F2937' } }
    let currentRow = 1

    for (let idx = 0; idx < tables.length; idx++) {
      const table = tables[idx]
      const titleText = table.tableName || `Bảng ${idx + 1}`

      const titleCell = ws.getCell(currentRow, 1)
      titleCell.value = titleText
      titleCell.font = fontTitle

      currentRow += 2
      const rowOffset = currentRow - 1

      currentRow = writeTableDataToWorksheet(ws, table, currentRow, true)
      applyTableMerges(ws, table.merges, rowOffset, true)

      currentRow += 3
    }
    autofitColumnWidths(ws)
    return wb
  }

  private async buildIndividualZipBuffer(tables: ClientTableItemSchemaType[]): Promise<Buffer> {
    const zip = new JSZip()
    const usedFilenames = new Set<string>()

    for (let idx = 0; idx < tables.length; idx++) {
      const table = tables[idx]
      const wb = this.buildWorkbookForTable(table, idx)
      const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer())

      const rawFileName = sanitizeFileName(table.tableName, `Bang_${idx + 1}`)
      let finalFileName = rawFileName
      let counter = 1
      while (usedFilenames.has(finalFileName.toLowerCase())) {
        finalFileName = `${rawFileName} (${counter})`
        counter++
      }
      usedFilenames.add(finalFileName.toLowerCase())
      zip.file(`${finalFileName}.xlsx`, excelBuffer)
    }

    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  }

  private buildMultiSheetWorkbook(tables: ClientTableItemSchemaType[]): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook()
    const usedSheetNames = new Set<string>()

    for (let idx = 0; idx < tables.length; idx++) {
      const table = tables[idx]
      const sheetName = sanitizeSheetName(table.tableName, `Sheet ${idx + 1}`)
      let finalSheetName = sheetName
      let counter = 1
      while (usedSheetNames.has(finalSheetName.toLowerCase())) {
        const suffix = ` (${counter})`
        const maxLen = 31 - suffix.length
        finalSheetName = sheetName.slice(0, maxLen) + suffix
        counter++
      }
      usedSheetNames.add(finalSheetName.toLowerCase())
      const ws = wb.addWorksheet(finalSheetName)
      ws.views = [{ showGridLines: true }]
      writeTableDataToWorksheet(ws, table, 1, false)
      applyTableMerges(ws, table.merges, 0, false)
      autofitColumnWidths(ws)
    }

    return wb
  }

  async exportTables(
    tables: ClientTableItemSchemaType[],
    options?: ExportOptionsSchemaType,
  ): Promise<{ fileBytes: Buffer; mediaType: string; filename: string }> {
    const opts = options || { zip: false, verticalMerge: false }

    if (opts.zip) {
      const zipBytes = await this.buildIndividualZipBuffer(tables)
      return {
        fileBytes: zipBytes,
        mediaType: 'application/zip',
        filename: 'extracted_tables_individual.zip',
      }
    } else if (opts.verticalMerge) {
      const wb = this.buildCombinedVerticalWorkbook(tables)
      const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer())
      return {
        fileBytes: excelBuffer,
        mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'extracted_data_merged.xlsx',
      }
    } else {
      const wb = this.buildMultiSheetWorkbook(tables)
      const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer())
      return {
        fileBytes: excelBuffer,
        mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'extracted_data_combined.xlsx',
      }
    }
  }
}
