import {
  fileRules,
  httpUrlSchema,
  messagePayloadSchema,
  validateFile,
} from '@/lib/validation'

describe('message validation', () => {
  it('accepts valid messages of every non-file type', () => {
    expect(
      messagePayloadSchema.safeParse({ type: 'text', text: 'Hello' }).success,
    ).toBe(true)
    expect(
      messagePayloadSchema.safeParse({
        type: 'link',
        url: 'https://example.com/a',
      }).success,
    ).toBe(true)
    expect(
      messagePayloadSchema.safeParse({
        type: 'location',
        latitude: 33.7,
        longitude: 73.1,
      }).success,
    ).toBe(true)
    expect(
      messagePayloadSchema.safeParse({
        type: 'image',
        attachmentId: crypto.randomUUID(),
      }).success,
    ).toBe(true)
  })
  it('rejects empty text and invalid coordinates', () => {
    expect(
      messagePayloadSchema.safeParse({ type: 'text', text: ' ' }).success,
    ).toBe(false)
    expect(
      messagePayloadSchema.safeParse({
        type: 'location',
        latitude: 91,
        longitude: 0,
      }).success,
    ).toBe(false)
  })
})

describe('URL and file validation', () => {
  it('allows only HTTP(S)', () => {
    expect(httpUrlSchema.safeParse('https://example.com').success).toBe(true)
    expect(httpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false)
    expect(httpUrlSchema.safeParse('ftp://example.com').success).toBe(false)
  })
  it('validates MIME type and size', () => {
    expect(
      validateFile(
        new File(['ok'], 'photo.png', { type: 'image/png' }),
        'image',
      ),
    ).toEqual({ valid: true })
    expect(
      validateFile(
        new File(['bad'], 'payload.svg', { type: 'image/svg+xml' }),
        'image',
      ),
    ).toEqual({ valid: false, message: 'Unsupported file type' })
    const tooLarge = new File(
      [new Uint8Array(fileRules.document.max + 1)],
      'large.pdf',
      { type: 'application/pdf' },
    )
    expect(validateFile(tooLarge, 'document')).toEqual({
      valid: false,
      message: 'File is empty or too large',
    })
  })
})
