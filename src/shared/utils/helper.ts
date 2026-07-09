import * as fs from 'fs/promises'
import libre from 'libreoffice-convert'
import path from 'path'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'

const convert = promisify(libre.convert)

export const generateRandomFilename = (fileName: string) => {
  const ext = path.extname(fileName)
  return `${uuidv4()}${ext}`
}

export const convertToPdf = async ({ docxPath, pdfPath }: { docxPath: string; pdfPath: string }) => {
  const docx = await fs.readFile(docxPath)
  const pdf = await convert(docx, '.pdf', undefined)
  await fs.writeFile(pdfPath, pdf)
}
