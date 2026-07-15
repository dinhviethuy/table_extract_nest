import { ImageAnnotatorClient } from '@google-cloud/vision'
import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class GoogleVisionService {
  private readonly client: ImageAnnotatorClient
  private readonly logger = new Logger(GoogleVisionService.name)

  constructor() {
    this.client = new ImageAnnotatorClient()
  }

  /**
   * Helper function to perform function with retries and exponential backoff
   */
  private async retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (retries <= 0) {
        throw error
      }
      const isRateLimit = error && (error.code === 429 || error.status === 429 || String(error).includes('429'))
      const isTransient = error && (error.code === 503 || error.status === 503 || String(error).includes('503'))

      if (isRateLimit || isTransient) {
        this.logger.warn(
          `Gặp lỗi Vision API (${error.code || '429/503'}). Đang thử lại sau ${delay}ms. Số lượt thử lại còn lại: ${retries}`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.retryWithBackoff(fn, retries - 1, delay * 2)
      }
      throw error
    }
  }

  /**
   * Extract text from an image page buffer (PNG, JPEG, WEBP, BMP, etc.)
   */
  async extractTextFromImagePage(fileBytes: Buffer): Promise<{ text: string; confidence: number }> {
    return this.retryWithBackoff(async () => {
      const [result] = await this.client.documentTextDetection({
        image: { content: fileBytes },
      })

      const fullTextAnnotation = result.fullTextAnnotation
      if (!fullTextAnnotation) {
        return { text: '', confidence: 0 }
      }

      // Calculate an average confidence score across all blocks
      let totalConfidence = 0
      let blockCount = 0
      for (const page of fullTextAnnotation.pages ?? []) {
        for (const block of page.blocks ?? []) {
          totalConfidence += block.confidence ?? 0
          blockCount++
        }
      }

      const avgConfidence = blockCount > 0 ? totalConfidence / blockCount : 1.0

      return {
        text: fullTextAnnotation.text ?? '',
        confidence: avgConfidence,
      }
    })
  }

  /**
   * Extract text from a single-page PDF buffer
   */
  async extractTextFromPdfPage(fileBytes: Buffer): Promise<{ text: string; confidence: number }> {
    return this.retryWithBackoff(async () => {
      const [result] = await this.client.batchAnnotateFiles({
        requests: [
          {
            inputConfig: {
              content: fileBytes,
              mimeType: 'application/pdf',
            },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            pages: [1],
          },
        ],
      })

      const response = result.responses?.[0]
      if (response?.error) {
        throw new Error(response.error.message || 'Lỗi xử lý file PDF từ Vision API')
      }

      const pageResponse = response?.responses?.[0]
      if (!pageResponse) {
        return { text: '', confidence: 0 }
      }

      const fullTextAnnotation = pageResponse.fullTextAnnotation
      if (!fullTextAnnotation) {
        return { text: '', confidence: 0 }
      }

      let totalConfidence = 0
      let blockCount = 0
      for (const page of fullTextAnnotation.pages ?? []) {
        for (const block of page.blocks ?? []) {
          totalConfidence += block.confidence ?? 0
          blockCount++
        }
      }

      const avgConfidence = blockCount > 0 ? totalConfidence / blockCount : 1.0

      return {
        text: fullTextAnnotation.text ?? '',
        confidence: avgConfidence,
      }
    })
  }
}
