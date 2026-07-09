import { CallHandler, ExecutionContext, Injectable, StreamableFile } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ZodSerializationException, ZodSerializerInterceptor } from 'nestjs-zod'
import { map, Observable } from 'rxjs'
import { ZodError } from 'zod'
import { MessageKey } from '../decorators/message.decorator'

const createZodSerializationException = (error: ZodError) => {
  return new ZodSerializationException(error)
}

@Injectable()
export class CustomZodSerializerInterceptor extends ZodSerializerInterceptor {
  constructor(protected readonly reflector: Reflector) {
    super(reflector)
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const responseSchema = (this as any).getContextResponseSchema(context)
    const statusCode = context.switchToHttp().getResponse().statusCode
    const message = this.reflector.get<string | undefined>(MessageKey, context.getHandler()) ?? 'Thành công'

    return next.handle().pipe(
      map((res) => {
        if (!responseSchema || typeof res !== 'object' || res instanceof StreamableFile) {
          return {
            data: res,
            statusCode,
            message,
          }
        }

        let validatedData: any
        try {
          if (Array.isArray(responseSchema)) {
            const schemaOrDto = responseSchema[0]
            const schema = 'schema' in schemaOrDto ? schemaOrDto.schema : schemaOrDto
            const arrSchema = schema.array()
            validatedData = arrSchema.parse(res)
          } else {
            const schema = 'schema' in responseSchema ? responseSchema.schema : responseSchema
            if (Array.isArray(res)) {
              validatedData = res.map((item) => schema.parse(item))
            } else {
              validatedData = schema.parse(res)
            }
          }
        } catch (error) {
          if (error instanceof ZodError) {
            throw createZodSerializationException(error)
          }
          throw error
        }

        return {
          data: validatedData,
          statusCode,
          message,
        }
      }),
    )
  }
}
