import { Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { sanitizeSheetName, sanitizeFileName } from '../../shared/utils/excel/excel-utils'
import { ClientTableItemSchemaType, ExportOptionsSchemaType } from '../export-excel/export-excel.schema'

@Injectable()
export class ExcelExporterService {
  private buildWorkbookForTable(table: ClientTableItemSchemaType, idx: number): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook()
    const sheetName = sanitizeSheetName(table.tableName, `Sheet ${idx + 1}`)
    const ws = wb.addWorksheet(sheetName)
    ws.views = [{ showGridLines: true }]

    // Styles
    const fontHeader = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    const fillHeader: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A6CF7' } }
    const fontBody = { name: 'Arial', size: 10, color: { argb: 'FF000000' } }
    const fillZebra: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } }
    const thinSide = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFD0D0D0' } }
    const mediumBottomSide = { style: 'medium' as ExcelJS.BorderStyle, color: { argb: 'FF4A6CF7' } }
    const borderCell = { left: thinSide, right: thinSide, top: thinSide, bottom: thinSide }
    const borderHeader = { left: thinSide, right: thinSide, top: thinSide, bottom: mediumBottomSide }
    const alignCenter: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
    const alignLeft: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true }

    let currentRow = 1

    if (table.headerRows !== undefined && table.headerRows !== null) {
      const headerRowsSet = new Set(table.headerRows)
      for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
        const rData = table.rows[rIdx]
        const isHeader = headerRowsSet.has(rIdx)
        const row = ws.getRow(currentRow)
        row.height = isHeader ? 25 : 20

        for (let cIdx = 0; cIdx < rData.length; cIdx++) {
          const val = rData[cIdx]
          const cell = row.getCell(cIdx + 1)
          cell.value = val
          cell.alignment = isHeader ? alignCenter : alignLeft

          if (isHeader) {
            cell.font = fontHeader
            cell.fill = fillHeader
            cell.border = borderHeader
          } else {
            cell.font = fontBody
            cell.border = borderCell
            if (rIdx % 2 === 1) {
              cell.fill = fillZebra
            }
          }
        }
        currentRow++
      }
    } else {
      let headersList: any[][] = []
      if (table.headers && table.headers.length > 0) {
        if (Array.isArray(table.headers[0])) {
          headersList = table.headers as any[][]
        } else {
          headersList = [table.headers]
        }
      }

      for (const hRow of headersList) {
        const row = ws.getRow(currentRow)
        row.height = 25
        for (let cIdx = 0; cIdx < hRow.length; cIdx++) {
          const val = hRow[cIdx]
          const cell = row.getCell(cIdx + 1)
          cell.value = val
          cell.font = fontHeader
          cell.fill = fillHeader
          cell.alignment = alignCenter
          cell.border = borderHeader
        }
        currentRow++
      }

      for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
        const rData = table.rows[rIdx]
        const row = ws.getRow(currentRow)
        row.height = 20
        const isZebra = rIdx % 2 === 1
        for (let cIdx = 0; cIdx < rData.length; cIdx++) {
          const val = rData[cIdx]
          const cell = row.getCell(cIdx + 1)
          cell.value = val
          cell.font = fontBody
          if (isZebra) {
            cell.fill = fillZebra
          }
          cell.alignment = alignLeft
          cell.border = borderCell
        }
        currentRow++
      }
    }

    // Apply merges
    if (table.merges && table.merges.length > 0) {
      for (const merge of table.merges) {
        try {
          const startR = merge.startRow + 1
          const startC = merge.startCol + 1
          const endR = merge.endRow + 1
          const endC = merge.endCol + 1

          for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
              ws.getCell(r, c).border = borderCell
            }
          }

          ws.mergeCells(startR, startC, endR, endC)
        } catch (e) {
          // ignore merge exceptions
        }
      }
    }

    // Autofit column widths
    ws.columns.forEach((column) => {
      let maxLen = 0
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        if (cell.master && cell.master.address !== cell.address) {
          return
        }
        if (cell.value !== undefined && cell.value !== null) {
          const valStr = cell.value.toString()
          if (valStr.length > maxLen) {
            maxLen = valStr.length
          }
        }
      })
      column.width = Math.max(10, Math.min(50, maxLen + 3))
    })

    return wb
  }

  private buildCombinedVerticalWorkbook(tables: ClientTableItemSchemaType[]): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Dữ liệu gộp dọc')
    ws.views = [{ showGridLines: true }]

    const fontTitle = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F2937' } }
    const fontHeader = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    const fillHeader: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A6CF7' } }
    const fontBody = { name: 'Arial', size: 10, color: { argb: 'FF000000' } }
    const fillZebra: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } }

    const thinSideVertical = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFE0E0E0' } }
    const mediumBottomSide = { style: 'medium' as ExcelJS.BorderStyle, color: { argb: 'FF4A6CF7' } }
    const borderCell = {
      left: thinSideVertical,
      right: thinSideVertical,
      top: thinSideVertical,
      bottom: thinSideVertical,
    }
    const borderHeader = {
      left: thinSideVertical,
      right: thinSideVertical,
      top: thinSideVertical,
      bottom: mediumBottomSide,
    }

    const alignCenter: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
    const alignLeft: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true }

    let currentRow = 1

    for (let idx = 0; idx < tables.length; idx++) {
      const table = tables[idx]
      const titleText = table.tableName || `Bảng ${idx + 1}`

      const titleCell = ws.getCell(currentRow, 1)
      titleCell.value = titleText
      titleCell.font = fontTitle

      currentRow += 2
      const rowOffset = currentRow - 1

      if (table.headerRows !== undefined && table.headerRows !== null) {
        const headerRowsSet = new Set(table.headerRows)
        for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
          const rData = table.rows[rIdx]
          const isHeader = headerRowsSet.has(rIdx)
          const row = ws.getRow(currentRow)
          row.height = isHeader ? 25 : 20

          for (let cIdx = 0; cIdx < rData.length; cIdx++) {
            const val = rData[cIdx]
            const cell = row.getCell(cIdx + 1)
            cell.value = val
            cell.alignment = isHeader ? alignCenter : alignLeft

            if (isHeader) {
              cell.font = fontHeader
              cell.fill = fillHeader
              cell.border = borderHeader
            } else {
              cell.font = fontBody
              cell.border = borderCell
              if (rIdx % 2 === 1) {
                cell.fill = fillZebra
              }
            }
          }
          currentRow++
        }
      } else {
        let headersList: any[][] = []
        if (table.headers && table.headers.length > 0) {
          if (Array.isArray(table.headers[0])) {
            headersList = table.headers as any[][]
          } else {
            headersList = [table.headers]
          }
        }

        for (const hRow of headersList) {
          const row = ws.getRow(currentRow)
          row.height = 25
          for (let cIdx = 0; cIdx < hRow.length; cIdx++) {
            const val = hRow[cIdx]
            const cell = row.getCell(cIdx + 1)
            cell.value = val
            cell.font = fontHeader
            cell.fill = fillHeader
            cell.alignment = alignCenter
            cell.border = borderHeader
          }
          currentRow++
        }

        for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
          const rData = table.rows[rIdx]
          const row = ws.getRow(currentRow)
          row.height = 20
          const isZebra = rIdx % 2 === 1
          for (let cIdx = 0; cIdx < rData.length; cIdx++) {
            const val = rData[cIdx]
            const cell = row.getCell(cIdx + 1)
            cell.value = val
            cell.font = fontBody
            if (isZebra) {
              cell.fill = fillZebra
            }
            cell.alignment = alignLeft
            cell.border = borderCell
          }
          currentRow++
        }
      }

      if (table.merges && table.merges.length > 0) {
        for (const merge of table.merges) {
          try {
            const startR = rowOffset + merge.startRow + 1
            const startC = merge.startCol + 1
            const endR = rowOffset + merge.endRow + 1
            const endC = merge.endCol + 1

            for (let r = startR; r <= endR; r++) {
              for (let c = startC; c <= endC; c++) {
                ws.getCell(r, c).border = borderCell
              }
            }

            ws.mergeCells(startR, startC, endR, endC)
          } catch (e) {
            // ignore merge exceptions
          }
        }
      }

      currentRow += 3
    }

    // Autofit column widths
    ws.columns.forEach((column) => {
      let maxLen = 0
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        if (cell.master && cell.master.address !== cell.address) {
          return
        }
        if (cell.value !== undefined && cell.value !== null) {
          const valStr = cell.value.toString()
          if (valStr.length > maxLen) {
            maxLen = valStr.length
          }
        }
      })
      column.width = Math.max(10, Math.min(50, maxLen + 3))
    })

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

    const fontHeader = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    const fillHeader: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A6CF7' } }
    const fontBody = { name: 'Arial', size: 10, color: { argb: 'FF000000' } }
    const fillZebra: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } }

    const thinSide = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFD0D0D0' } }
    const mediumBottomSide = { style: 'medium' as ExcelJS.BorderStyle, color: { argb: 'FF4A6CF7' } }
    const borderCell = { left: thinSide, right: thinSide, top: thinSide, bottom: thinSide }
    const borderHeader = { left: thinSide, right: thinSide, top: thinSide, bottom: mediumBottomSide }

    const alignCenter: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
    const alignLeft: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true }

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

      let currentRow = 1

      if (table.headerRows !== undefined && table.headerRows !== null) {
        const headerRowsSet = new Set(table.headerRows)
        for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
          const rData = table.rows[rIdx]
          const isHeader = headerRowsSet.has(rIdx)
          const row = ws.getRow(currentRow)
          row.height = isHeader ? 25 : 20

          for (let cIdx = 0; cIdx < rData.length; cIdx++) {
            const val = rData[cIdx]
            const cell = row.getCell(cIdx + 1)
            cell.value = val
            cell.alignment = isHeader ? alignCenter : alignLeft

            if (isHeader) {
              cell.font = fontHeader
              cell.fill = fillHeader
              cell.border = borderHeader
            } else {
              cell.font = fontBody
              cell.border = borderCell
              if (rIdx % 2 === 1) {
                cell.fill = fillZebra
              }
            }
          }
          currentRow++
        }
      } else {
        let headersList: any[][] = []
        if (table.headers && table.headers.length > 0) {
          if (Array.isArray(table.headers[0])) {
            headersList = table.headers as any[][]
          } else {
            headersList = [table.headers]
          }
        }

        for (const hRow of headersList) {
          const row = ws.getRow(currentRow)
          row.height = 25
          for (let cIdx = 0; cIdx < hRow.length; cIdx++) {
            const val = hRow[cIdx]
            const cell = row.getCell(cIdx + 1)
            cell.value = val
            cell.font = fontHeader
            cell.fill = fillHeader
            cell.alignment = alignCenter
            cell.border = borderHeader
          }
          currentRow++
        }

        for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
          const rData = table.rows[rIdx]
          const row = ws.getRow(currentRow)
          row.height = 20
          const isZebra = rIdx % 2 === 1
          for (let cIdx = 0; cIdx < rData.length; cIdx++) {
            const val = rData[cIdx]
            const cell = row.getCell(cIdx + 1)
            cell.value = val
            cell.font = fontBody
            if (isZebra) {
              cell.fill = fillZebra
            }
            cell.alignment = alignLeft
            cell.border = borderCell
          }
          currentRow++
        }
      }

      if (table.merges && table.merges.length > 0) {
        for (const merge of table.merges) {
          try {
            const startR = merge.startRow + 1
            const startC = merge.startCol + 1
            const endR = merge.endRow + 1
            const endC = merge.endCol + 1

            for (let r = startR; r <= endR; r++) {
              for (let c = startC; c <= endC; c++) {
                ws.getCell(r, c).border = borderCell
              }
            }

            ws.mergeCells(startR, startC, endR, endC)
          } catch (e) {
            // ignore merge exceptions
          }
        }
      }

      // Autofit column widths
      ws.columns.forEach((column) => {
        let maxLen = 0
        column.eachCell?.({ includeEmpty: false }, (cell) => {
          if (cell.master && cell.master.address !== cell.address) {
            return
          }
          if (cell.value !== undefined && cell.value !== null) {
            const valStr = cell.value.toString()
            if (valStr.length > maxLen) {
              maxLen = valStr.length
            }
          }
        })
        column.width = Math.max(10, Math.min(50, maxLen + 3))
      })
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
