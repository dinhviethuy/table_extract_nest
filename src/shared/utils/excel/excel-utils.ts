import * as ExcelJS from 'exceljs';
import { ExcelMergeRange, ExcelTableItem } from './excel.interface';

export function sanitizeSheetName(name: string | null | undefined, fallback: string): string {
  const rawName = name || fallback
  const invalidChars = ['\\', '/', '?', '*', '[', ']', ':']
  let sanitized = rawName
  for (const char of invalidChars) {
    sanitized = sanitized.split(char).join('')
  }
  return sanitized.slice(0, 31).trim() || fallback
}

export function sanitizeFileName(name: string | null | undefined, fallback: string): string {
  const rawFileName = name || fallback
  const invalidChars = ['/', '\\', '?', '%', '*', ':', '|', '"', '<', '>']
  let sanitized = rawFileName
  for (const char of invalidChars) {
    sanitized = sanitized.split(char).join('_')
  }
  return sanitized.trim() || fallback
}

export function getExcelStyles(useVerticalStyles = false) {
  const fontHeader = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  const fillHeader: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A6CF7' } }
  const fontBody = { name: 'Arial', size: 10, color: { argb: 'FF000000' } }
  const fillZebra: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } }

  const thinColor = useVerticalStyles ? 'FFE0E0E0' : 'FFD0D0D0'
  const thinSide = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: thinColor } }
  const mediumBottomSide = { style: 'medium' as ExcelJS.BorderStyle, color: { argb: 'FF4A6CF7' } }

  const borderCell = { left: thinSide, right: thinSide, top: thinSide, bottom: thinSide }
  const borderHeader = { left: thinSide, right: thinSide, top: thinSide, bottom: mediumBottomSide }

  const alignCenter: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
  const alignLeft: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true }

  return {
    fontHeader,
    fillHeader,
    fontBody,
    fillZebra,
    borderCell,
    borderHeader,
    alignCenter,
    alignLeft,
  }
}

export function writeTableDataToWorksheet(
  ws: ExcelJS.Worksheet,
  table: ExcelTableItem,
  startRow: number,
  useVerticalStyles = false,
): number {
  const { fontHeader, fillHeader, fontBody, fillZebra, borderCell, borderHeader, alignCenter, alignLeft } =
    getExcelStyles(useVerticalStyles)

  let currentRow = startRow

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

  return currentRow
}

export function applyTableMerges(
  ws: ExcelJS.Worksheet,
  merges: ExcelMergeRange[] | null | undefined,
  rowOffset: number,
  useVerticalStyles = false,
): void {
  if (!merges || merges.length === 0) return

  const { borderCell } = getExcelStyles(useVerticalStyles)

  for (const merge of merges) {
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

export function autofitColumnWidths(ws: ExcelJS.Worksheet): void {
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
