import { UnprocessableEntityException } from '@nestjs/common'
import { createZodValidationPipe } from 'nestjs-zod'
import { ZodError } from 'zod'

const CustomZodValidationPipe = createZodValidationPipe({
  createValidationException: (e: ZodError) => {
    return new UnprocessableEntityException(
      e.issues.map((i) => {
        return {
          ...i,
          path: i.path.join(','),
          message: i.message,
        }
      }),
    )
  },
})

export default CustomZodValidationPipe
