import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { JobStoreService } from './job-store.service'
import { OCR_QUEUE_NAME, TABLE_QUEUE_NAME } from '../constants/ocr.constant'
import { JobState } from '../../queues/ocr/ocr.interface'

describe('JobStoreService', () => {
  let service: JobStoreService
  let mockRedisStore: Record<string, string> = {}

  const mockRedisClient = {
    set: jest.fn().mockImplementation((key, val) => {
      mockRedisStore[key] = val
      return 'OK'
    }),
    get: jest.fn().mockImplementation((key) => {
      return mockRedisStore[key] || null
    }),
  }

  const mockOcrQueue = {
    client: Promise.resolve(mockRedisClient),
    getJob: jest.fn(),
  }

  const mockTableQueue = {
    client: Promise.resolve(mockRedisClient),
    getJob: jest.fn(),
  }

  const mockResultStorage = {
    getResults: jest.fn().mockResolvedValue([
      { pageNumber: 1, text: 'Page 1 content', confidence: 0.95 }
    ]),
    appendPageResult: jest.fn(),
    promoteResults: jest.fn(),
    deleteResults: jest.fn(),
  }

  beforeEach(async () => {
    mockRedisStore = {}
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobStoreService,
        {
          provide: getQueueToken(OCR_QUEUE_NAME),
          useValue: mockOcrQueue,
        },
        {
          provide: getQueueToken(TABLE_QUEUE_NAME),
          useValue: mockTableQueue,
        },
        {
          provide: 'ResultStorage',
          useValue: mockResultStorage,
        },
      ],
    }).compile()

    service = module.get<JobStoreService>(JobStoreService)
  })

  it('should successfully save and get OCR job metadata', async () => {
    const jobId = 'test-job'
    const statusData = {
      status: JobState.OCR_PROCESSING,
      progress: { completed: 1, total: 10 },
      cancellationFlag: false,
    }

    await service.saveOcrJobStatus(jobId, statusData)
    const result = await service.getOcrJobStatus(jobId)

    expect(result).toEqual(statusData)
    expect(mockRedisClient.set).toHaveBeenCalled()
    expect(mockRedisClient.get).toHaveBeenCalled()
  })

  it('should return mapped status and pages from ResultStorage on COMPLETED status', async () => {
    const jobId = 'completed-job'
    const statusData = {
      status: JobState.COMPLETED,
      progress: { completed: 1, total: 1 },
    }

    await service.saveOcrJobStatus(jobId, statusData)
    const status = await service.getJobStatus(jobId)

    expect(status.status).toBe('completed')
    expect(status.pages.length).toBe(1)
    expect(status.pages[0].text).toBe('Page 1 content')
    expect(mockResultStorage.getResults).toHaveBeenCalledWith(jobId)
  })

  it('should flag cancellation properly', async () => {
    const jobId = 'cancel-job'
    const statusData = {
      status: JobState.QUEUED,
      progress: { completed: 0, total: 1 },
    }

    await service.saveOcrJobStatus(jobId, statusData)
    await service.cancelJob(jobId)

    const result = await service.getOcrJobStatus(jobId)
    expect(result?.cancellationFlag).toBe(true)
    expect(result?.status).toBe(JobState.CANCELLED)
  })
})
