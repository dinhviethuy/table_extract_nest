import { Test, TestingModule } from '@nestjs/testing'
import { CleanupProcessor } from './cleanup.processor'
import * as fs from 'fs/promises'
import { Job } from 'bullmq'

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  rm: jest.fn(),
}))

describe('CleanupProcessor', () => {
  let processor: CleanupProcessor

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [CleanupProcessor],
    }).compile()

    processor = module.get<CleanupProcessor>(CleanupProcessor)
  })

  it('should delete directory recursively if it exists', async () => {
    const mockAccess = fs.access as unknown as jest.Mock
    mockAccess.mockResolvedValue(undefined) // directory exists

    const mockRm = fs.rm as unknown as jest.Mock
    mockRm.mockResolvedValue(undefined)

    const mockJob = {
      data: { jobId: 'test-job-uuid' },
    } as unknown as Job

    await processor.process(mockJob)

    expect(mockAccess).toHaveBeenCalled()
    expect(mockRm).toHaveBeenCalledWith(
      expect.stringContaining('test-job-uuid'),
      { recursive: true, force: true }
    )
  })

  it('should complete silently if the directory does not exist (idempotent)', async () => {
    const mockAccess = fs.access as unknown as jest.Mock
    mockAccess.mockRejectedValue(new Error('ENOENT')) // directory does not exist

    const mockRm = fs.rm as unknown as jest.Mock

    const mockJob = {
      data: { jobId: 'test-job-uuid' },
    } as unknown as Job

    await processor.process(mockJob)

    expect(mockAccess).toHaveBeenCalled()
    expect(mockRm).not.toHaveBeenCalled()
  })
})
