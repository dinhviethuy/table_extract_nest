import { Test, TestingModule } from '@nestjs/testing'
import * as fs from 'fs/promises'
import * as path from 'path'
import { LocalFileResultStorageService } from './local-file-result-storage.service'
import envConfig from '../configs/env'

describe('LocalFileResultStorageService', () => {
  let service: LocalFileResultStorageService
  const testJobId = 'test-job-uuid'
  const attemptToken = 'attempt-1'
  const tempDir = path.resolve(envConfig.TEMP_DIRECTORY, 'results')

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocalFileResultStorageService],
    }).compile()

    service = module.get<LocalFileResultStorageService>(LocalFileResultStorageService)
    await fs.mkdir(tempDir, { recursive: true }).catch(() => {})
  })

  afterEach(async () => {
    // Cleanup any test files
    const files = await fs.readdir(tempDir).catch(() => [])
    for (const file of files) {
      if (file.startsWith(testJobId)) {
        await fs.unlink(path.join(tempDir, file)).catch(() => {})
      }
    }
  })

  it('should append page result without reading the entire file', async () => {
    const page1 = { pageNumber: 1, text: 'Hello page 1', confidence: 0.9 }
    const page2 = { pageNumber: 2, text: 'Hello page 2', confidence: 0.85 }

    await service.appendPageResult(testJobId, attemptToken, page1)
    await service.appendPageResult(testJobId, attemptToken, page2)

    const attemptFile = path.join(tempDir, `${testJobId}_${attemptToken}.jsonl`)
    const rawContent = await fs.readFile(attemptFile, 'utf8')
    const lines = rawContent.trim().split('\n')

    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[0])).toEqual(page1)
    expect(JSON.parse(lines[1])).toEqual(page2)
  })

  it('should promote and sort results on promotion and recovery', async () => {
    const page2 = { pageNumber: 2, text: 'page 2', confidence: 0.95 }
    const page1 = { pageNumber: 1, text: 'page 1', confidence: 0.99 }

    // Append out of order
    await service.appendPageResult(testJobId, attemptToken, page2)
    await service.appendPageResult(testJobId, attemptToken, page1)

    // Promote
    await service.promoteResults(testJobId, attemptToken)

    const finalResults = await service.getResults(testJobId)
    expect(finalResults.length).toBe(2)
    expect(finalResults[0].pageNumber).toBe(1)
    expect(finalResults[1].pageNumber).toBe(2)
  })

  it('should ignore trailing incomplete line but fail on corruption in the middle', async () => {
    const attemptFile = path.join(tempDir, `${testJobId}_${attemptToken}.jsonl`)
    
    // Write valid page 1, corrupted page 2, trailing partial
    const content = 
      JSON.stringify({ pageNumber: 1, text: 'page 1', confidence: 0.9 }) + '\n' +
      JSON.stringify({ pageNumber: 2, text: 'page 2', confidence: 0.8 }) + '\n' +
      '{"pageNumber":3, "text": "incomplete'
    
    await fs.writeFile(attemptFile, content, 'utf8')
    await service.promoteResults(testJobId, attemptToken)

    const results = await service.getResults(testJobId)
    expect(results.length).toBe(2) // successfully ignored the trailing partial line
    expect(results[0].pageNumber).toBe(1)
    expect(results[1].pageNumber).toBe(2)
    
    // Middle corruption test
    const corruptedContent = 
      JSON.stringify({ pageNumber: 1, text: 'page 1', confidence: 0.9 }) + '\n' +
      '{"pageNumber":2, "text": "corrupted middle' + '\n' +
      JSON.stringify({ pageNumber: 3, text: 'page 3', confidence: 0.8 }) + '\n'
      
    const corruptedFile = path.join(tempDir, `${testJobId}_corrupt.jsonl`)
    await fs.writeFile(corruptedFile, corruptedContent, 'utf8')
    await fs.rename(corruptedFile, path.join(tempDir, `${testJobId}.jsonl`))

    await expect(service.getResults(testJobId)).rejects.toThrow()
  })

  it('should perform deleteResults idempotently', async () => {
    await service.deleteResults(testJobId)
    // Running second time should not throw
    await expect(service.deleteResults(testJobId)).resolves.not.toThrow()
  })
})
