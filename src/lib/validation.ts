import { z } from 'zod'
import { generateId } from '@/lib/utils'
import {
  CUSTOM_RETENTION_MAX_SECONDS,
  CUSTOM_RETENTION_MIN_SECONDS,
} from '@/lib/domain/retention'

export const uuidSchema = z.string().uuid()

export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9][a-z0-9_.]+$/),
  display_name: z.string().trim().min(1).max(80),
  avatar_url: z
    .union([z.literal(''), z.string().url().startsWith('https://')])
    .optional(),
  bio: z.string().trim().max(160).optional(),
})

export const friendRequestActionSchema = z.object({
  requestId: uuidSchema,
  action: z.enum(['accepted', 'rejected', 'cancelled']),
})

export const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }, 'Only HTTP and HTTPS links are allowed')

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().trim().max(120).optional(),
})

export const customRetentionSchema = z
  .number()
  .int()
  .min(CUSTOM_RETENTION_MIN_SECONDS)
  .max(CUSTOM_RETENTION_MAX_SECONDS)

export const retentionSchema = z
  .object({
    mode: z.enum([
      '24_hours',
      '12_hours',
      '3_hours',
      'instant_after_view',
      '5_minutes_after_view',
      'never',
      'custom',
    ]),
    customSeconds: z.number().int().nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.mode === 'custom' &&
      !customRetentionSchema.safeParse(value.customSeconds).success
    ) {
      context.addIssue({
        code: 'custom',
        path: ['customSeconds'],
        message: 'Choose between 1 minute and 365 days',
      })
    }
    if (value.mode !== 'custom' && value.customSeconds !== null) {
      context.addIssue({
        code: 'custom',
        path: ['customSeconds'],
        message: 'Custom duration is only valid in custom mode',
      })
    }
  })

const textMessageSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1).max(4000),
})
const linkMessageSchema = z.object({
  type: z.literal('link'),
  url: httpUrlSchema,
})
const locationMessageSchema = coordinatesSchema.extend({
  type: z.literal('location'),
})
const attachmentMessageSchema = z.object({
  type: z.enum(['image', 'video', 'voice', 'document']),
  attachmentId: z.string().uuid(),
})
export const messagePayloadSchema = z.discriminatedUnion('type', [
  textMessageSchema,
  linkMessageSchema,
  locationMessageSchema,
  attachmentMessageSchema,
])

export const fileRules = {
  image: {
    max: 15 * 1024 * 1024,
    mime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  video: {
    max: 50 * 1024 * 1024,
    mime: ['video/mp4', 'video/webm', 'video/quicktime'],
  },
  voice: {
    max: 15 * 1024 * 1024,
    mime: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'],
  },
  document: {
    max: 25 * 1024 * 1024,
    mime: [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
    ],
  },
} as const

export type FileKind = keyof typeof fileRules

export function validateFile(
  file: File,
  kind: FileKind,
): { valid: true } | { valid: false; message: string } {
  const rules = fileRules[kind]
  if (!(rules.mime as readonly string[]).includes(file.type))
    return { valid: false, message: 'Unsupported file type' }
  if (file.size <= 0 || file.size > rules.max)
    return { valid: false, message: 'File is empty or too large' }
  return { valid: true }
}

export function randomStorageName(file: File): string {
  const extension = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase()
    : undefined
  const safeExtension =
    extension && /^[a-z0-9]{1,10}$/.test(extension) ? `.${extension}` : ''
  return `${generateId()}${safeExtension}`
}
