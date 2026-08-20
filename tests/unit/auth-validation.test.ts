import { describe, expect, it } from 'vitest'
import {
  emailVerificationSchema,
  gmailSchema,
  newPasswordSchema,
  registerSchema,
} from '@/lib/auth-validation'

describe('email and password authentication validation', () => {
  it('accepts Gmail addresses case-insensitively and normalizes them', () => {
    expect(gmailSchema.parse('  Person.Name@GMAIL.COM ')).toBe(
      'person.name@gmail.com',
    )
  })

  it('rejects non-Gmail addresses', () => {
    expect(gmailSchema.safeParse('person@example.com').success).toBe(false)
  })

  it('accepts a complete registration payload', () => {
    expect(
      registerSchema.safeParse({
        fullName: 'Ayesha Khan',
        email: 'ayesha@gmail.com',
        password: 'Secure123',
        confirmPassword: 'Secure123',
      }).success,
    ).toBe(true)
  })

  it('rejects weak and mismatched passwords', () => {
    const weak = newPasswordSchema.safeParse({
      password: 'password',
      confirmPassword: 'different',
    })
    expect(weak.success).toBe(false)
    if (!weak.success) {
      expect(weak.error.flatten().fieldErrors.password).toBeTruthy()
      expect(weak.error.flatten().fieldErrors.confirmPassword).toContain(
        'Passwords do not match',
      )
    }
  })

  it('requires a six-digit verification code', () => {
    expect(
      emailVerificationSchema.safeParse({
        email: 'ayesha@gmail.com',
        code: '123456',
      }).success,
    ).toBe(true)
    expect(
      emailVerificationSchema.safeParse({
        email: 'ayesha@gmail.com',
        code: '12345a',
      }).success,
    ).toBe(false)
  })
})
