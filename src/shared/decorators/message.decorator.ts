import { SetMetadata } from '@nestjs/common'

export const MessageKey = 'message'

export const MessageRes = (message: string) => SetMetadata(MessageKey, message)
