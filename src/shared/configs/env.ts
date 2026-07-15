import { config } from 'dotenv'
import fs from 'fs'
import path from 'path'
import z from 'zod'

config({
  path: '.env',
})

if (!fs.existsSync(path.resolve('.env'))) {
  console.error('No .env file found')
  process.exit(1)
}

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  GCP_PROJECT_ID: z.string(),
  GCP_LOCATION: z.string().default('us'),
  GCP_PROCESSOR_ID: z.string(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string(),
  LIBRE_OFFICE_EXE: z.string().optional(),
  CLIENT_URL: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((url) => url.trim()) : [])),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  OCR_WORKER_CONCURRENCY: z.coerce.number().default(3),
  OCR_MAX_RETRIES: z.coerce.number().default(3),
  VISION_API_PAGE_CONCURRENCY: z.coerce.number().default(5),
})

const configServer = configSchema.safeParse(process.env)

if (!configServer.success) {
  console.log('Các giá trị khai báo trong file .env không hợp lệ')
  console.error(configServer.error)
  process.exit(1)
}

const envConfig = configServer.data

export default envConfig
