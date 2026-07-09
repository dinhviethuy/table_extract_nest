import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import envConfig from './shared/configs/env'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  if (envConfig.CLIENT_URL.length > 0) {
    app.enableCors({
      origin: envConfig.CLIENT_URL,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    })
  } else {
    app.enableCors({
      origin: '*',
    })
  }

  await app.listen(envConfig.PORT)
}
bootstrap()
