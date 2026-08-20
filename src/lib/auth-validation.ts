import { z } from 'zod'

export const gmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid Gmail address')
  .max(254)
  .refine((email) => email.endsWith('@gmail.com'), {
    message: 'Please use a Gmail address',
  })

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Full name must be at least 2 characters')
  .max(80, 'Full name must be 80 characters or fewer')
  .refine((name) => !/[\u0000-\u001f\u007f]/.test(name), {
    message: 'Full name contains unsupported characters',
  })

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or fewer')
  .regex(/[a-z]/, 'Add at least one lowercase letter')
  .regex(/[A-Z]/, 'Add at least one uppercase letter')
  .regex(/[0-9]/, 'Add at least one number')

const passwordsMatch = <
  T extends { password: string; confirmPassword: string },
>(
  value: T,
  context: z.RefinementCtx,
) => {
  if (value.password !== value.confirmPassword) {
    context.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    })
  }
}

export const loginSchema = z.object({
  email: gmailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
})

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    email: gmailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine(passwordsMatch)

export const emailVerificationSchema = z.object({
  email: gmailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const forgotPasswordSchema = z.object({ email: gmailSchema })

export const resetCodeSchema = z.object({
  email: gmailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine(passwordsMatch)

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
export type EmailVerificationValues = z.infer<typeof emailVerificationSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type ResetCodeValues = z.infer<typeof resetCodeSchema>
export type NewPasswordValues = z.infer<typeof newPasswordSchema>
