import { FileValidator } from '@nestjs/common'

export interface CustomFileTypeValidatorOptions {
  fileType: RegExp
}

export class CustomFileTypeValidator extends FileValidator<CustomFileTypeValidatorOptions> {
  constructor(validationOptions: CustomFileTypeValidatorOptions) {
    super(validationOptions)
  }

  isValid(file: any): boolean {
    if (!file) return false
    // Multer provides mimetype regardless of memory or disk storage
    const mimeType = file.mimetype || ''
    return this.validationOptions.fileType.test(mimeType)
  }

  buildErrorMessage(file: any): string {
    return `Validation failed (expected type matches ${this.validationOptions.fileType})`
  }
}
