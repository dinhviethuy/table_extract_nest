import { Test, TestingModule } from '@nestjs/testing'
import { PdfToolService } from './pdf-tool.service'
import { execFile } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}))

jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
}))

describe('PdfToolService', () => {
  let service: PdfToolService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfToolService],
    }).compile()

    service = module.get<PdfToolService>(PdfToolService)
  })

  it('should call pdfinfo and parse total pages count', async () => {
    const mockStdout = 'Title: Test PDF\nPages: 12\nFile size: 12345 bytes\n'
    const mockExecFile = execFile as unknown as jest.Mock
    mockExecFile.mockImplementation((file, args, callback) => {
      callback(null, { stdout: mockStdout, stderr: '' })
    })

    const pageCount = await service.getPageCount('test.pdf')
    expect(pageCount).toBe(12)
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.stringContaining('pdfinfo.exe'),
      [expect.stringContaining(path.normalize('test.pdf'))],
      expect.any(Function)
    )
  })

  it('should call pdftoppm to render exactly one page', async () => {
    const mockExecFile = execFile as unknown as jest.Mock
    mockExecFile.mockImplementation((file, args, callback) => {
      callback(null, { stdout: '', stderr: '' })
    })

    const mockReaddir = fs.readdir as unknown as jest.Mock
    mockReaddir.mockResolvedValue(['page-1.png'])

    const resultPath = await service.renderSinglePage('test.pdf', 1, 'uploads/test/page')
    expect(resultPath).toContain('page-1.png')
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.stringContaining('pdftoppm.exe'),
      [
        '-png',
        '-r', '150',
        '-f', '1',
        '-l', '1',
        expect.stringContaining(path.normalize('test.pdf')),
        expect.stringContaining(path.normalize('uploads/test/page'))
      ],
      expect.any(Function)
    )
  })
})
