import { Test, TestingModule } from '@nestjs/testing'
import { AppController } from './app.controller'
import { AppService } from './app.service'

describe('AppController', () => {
  let appController: AppController

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: 'JobStoreService',
          useValue: {
            cancelJob: jest.fn(),
          },
        },
        // We can also just import/register it directly as a class if Nest compiles it, but using the class or provide: JobStoreService is cleaner.
        {
          provide: require('./shared/services/job-store.service').JobStoreService,
          useValue: {
            cancelJob: jest.fn(),
          },
        },
      ],
    }).compile()

    appController = app.get<AppController>(AppController)
  })

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!')
    })
  })
})
