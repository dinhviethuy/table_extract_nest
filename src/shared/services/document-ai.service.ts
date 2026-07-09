import { DocumentProcessorServiceClient, protos } from '@google-cloud/documentai'

import { Injectable } from '@nestjs/common'
import { CellSchemaType, PageSchemaType, RowSchemaType, TableSchemaType } from '../../routes/extract-tables/extract-tables.schema'
import envConfig from '../configs/env'

@Injectable()
export class DocumentAiService {
  private readonly client: DocumentProcessorServiceClient
  private readonly name: string
  constructor() {
    this.client = new DocumentProcessorServiceClient({
      apiEndpoint: `${envConfig.GCP_LOCATION}-documentai.googleapis.com`,
    })
    this.name = this.client.processorPath(envConfig.GCP_PROJECT_ID, envConfig.GCP_LOCATION, envConfig.GCP_PROCESSOR_ID)
  }

  async extractTableFromPage({
    file_bytes,
    mimeType = 'application/pdf',
    pageIndex,
  }: {
    pageIndex: number
    file_bytes: Buffer
    mimeType: string
  }): Promise<PageSchemaType> {
    let document: protos.google.cloud.documentai.v1.IDocument
    try {
      const [result] = await this.client.processDocument({
        name: this.name,
        rawDocument: {
          content: file_bytes,
          mimeType,
        },
      })
      if (!result.document) {
        return {
          pageNumber: pageIndex,
          tables: [],
          error: 'Lỗi kết quả từ document ai',
        }
      }
      document = result.document
      const rawTables = document.pages?.[0]?.tables ?? []
      const documentText = document.text ?? ''
      const finalTables: TableSchemaType[] = []
      for (const table of rawTables) {
        const rawRows = [...(table.headerRows ?? []), ...(table.bodyRows ?? [])]
        if (rawRows.length === 0) continue
        // key = "row,col"
        const grid = new Map<
          string,
          {
            cell: any
            isOrigin: boolean
            rowSpan: number
            colSpan: number
          }
        >()
        for (let r = 0; r < rawRows.length; r++) {
          const row = rawRows[r]
          let c = 0
          for (const cell of row.cells ?? []) {
            while (grid.has(`${r},${c}`)) {
              c++
            }
            const rowSpan = cell.rowSpan ?? 1
            const colSpan = cell.colSpan ?? 1
            for (let dr = 0; dr < rowSpan; dr++) {
              for (let dc = 0; dc < colSpan; dc++) {
                grid.set(`${r + dr},${c + dc}`, {
                  cell,
                  isOrigin: dr === 0 && dc === 0,
                  rowSpan,
                  colSpan,
                })
              }
            }
            c += colSpan
          }
        }
        if (grid.size === 0) continue
        let maxRow = 0
        let maxCol = 0
        for (const key of grid.keys()) {
          const [r, c] = key.split(',').map(Number)
          maxRow = Math.max(maxRow, r)
          maxCol = Math.max(maxCol, c)
        }
        const tableRows: RowSchemaType[] = []
        for (let r = 0; r <= maxRow; r++) {
          const rowCells: CellSchemaType[] = []
          for (let c = 0; c <= maxCol; c++) {
            const gridCell = grid.get(`${r},${c}`)
            let text = ''
            let colSpan = 1
            let rowSpan = 1
            if (gridCell) {
              if (gridCell.isOrigin) {
                const cell = gridCell.cell
                const segments = cell.layout?.textAnchor?.textSegments ?? []
                text = segments
                  .map((segment: any) =>
                    documentText.substring(Number(segment.startIndex ?? 0), Number(segment.endIndex ?? 0)),
                  )
                  .join('')
                  .trim()
                  .replace(/\n/g, ' ')

                colSpan = gridCell.colSpan
                rowSpan = gridCell.rowSpan
              }
            }

            rowCells.push({
              colIndex: c,
              text,
              colSpan: colSpan,
              rowSpan: rowSpan,
            })
          }

          tableRows.push({
            rowIndex: r,
            cells: rowCells,
          })
        }

        finalTables.push({
          tableIndex: finalTables.length + 1,
          rows: tableRows,
        })
      }

      return {
        pageNumber: pageIndex + 1,
        tables: finalTables,
      }
    } catch (error) {
      return {
        pageNumber: pageIndex,
        tables: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
