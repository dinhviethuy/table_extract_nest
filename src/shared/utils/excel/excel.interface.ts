export interface ExcelMergeRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface ExcelTableItem {
  tableName?: string | null
  headers?: any[]
  rows: string[][]
  merges?: ExcelMergeRange[] | null
  headerRows?: number[] | null
}
