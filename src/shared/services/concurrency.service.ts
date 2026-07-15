import { Injectable } from '@nestjs/common'
import pLimit from 'p-limit'
import envConfig from '../configs/env'

@Injectable()
export class ConcurrencyService {
  // Global limit for Google API calls (both Document AI and Vision API)
  private readonly globalLimiter: ReturnType<typeof pLimit>

  // Internal limit per document page processing
  private readonly pageLimiter: ReturnType<typeof pLimit>

  constructor() {
    // Default max concurrent calls to Google APIs globally is 10
    this.globalLimiter = pLimit(10)
    
    // Page concurrency limit
    this.pageLimiter = pLimit(envConfig.VISION_CONCURRENCY)
  }

  /**
   * Run an asynchronous task within the global rate limit
   */
  async runGlobal<T>(fn: () => Promise<T>): Promise<T> {
    return this.globalLimiter(fn)
  }

  /**
   * Run an asynchronous task within the page rate limit
   */
  async runPage<T>(fn: () => Promise<T>): Promise<T> {
    return this.pageLimiter(fn)
  }
}
