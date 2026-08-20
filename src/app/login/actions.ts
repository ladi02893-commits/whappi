'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  emailVerificationSchema,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  registerSchema,
  resetCodeSchema,
} from '@/lib/auth-validation'
import {
  getInsForgeAuthActions,
  getInsForgeServerClient,
} from '@/lib/insforge/server'

export type AuthActionResult = {
  ok: boolean
  message: string
  step?: 'verify-email' | 'reset-code' | 'new-password' | 'login'
  email?: string
  fieldErrors?: Record<string, string[] | undefined>
}

function validationFailure(
  fieldErrors: Record<string, string[] | undefined>,
): AuthActionResult {
  return {
    ok: false,
    message: 'Please correct the highlighted fields.',
    fieldErrors,
  }
}

function authErrorMessage(
  error: { statusCode?: number; error?: string } | null,
  fallback: string,
) {
  if (error?.statusCode === 401) return 'Incorrect Gmail or password.'
  if (error?.statusCode === 403)
    return 'Please verify your Gmail before signing in.'
  if (error?.statusCode === 409)
    return 'An account already exists for this Gmail.'
  if (error?.statusCode === 429)
    return 'Too many attempts. Please wait a moment and try again.'
  return fallback
}

export async function loginWithPassword(
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return validationFailure(parsed.error.flatten().fieldErrors)

  const auth = await getInsForgeAuthActions()
  const { data, error } = await auth.signInWithPassword(parsed.data)
  if (error || !data?.user) {
    return {
      ok: false,
      message: authErrorMessage(error, 'Could not sign in. Please try again.'),
    }
  }

  redirect('/chat')
}

export async function registerWithPassword(
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return validationFailure(parsed.error.flatten().fieldErrors)

  const auth = await getInsForgeAuthActions()
  const { data, error } = await auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.fullName,
  })

  if (error || !data) {
    return {
      ok: false,
      message: authErrorMessage(
        error,
        'Could not create your account. Please try again.',
      ),
    }
  }

  if (data.requireEmailVerification) {
    return {
      ok: true,
      step: 'verify-email',
      email: parsed.data.email,
      message: 'We sent a 6-digit verification code to your Gmail.',
    }
  }

  redirect('/chat')
}

export async function verifyRegistrationEmail(
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = emailVerificationSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return validationFailure(parsed.error.flatten().fieldErrors)

  const auth = await getInsForgeAuthActions()
  const { data, error } = await auth.verifyEmail({
    email: parsed.data.email,
    otp: parsed.data.code,
  })
  if (error || !data?.user) {
    return {
      ok: false,
      message: authErrorMessage(
        error,
        'That verification code is invalid or expired.',
      ),
    }
  }

  redirect('/chat')
}

export async function resendRegistrationCode(
  email: string,
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email })
  if (!parsed.success)
    return validationFailure(parsed.error.flatten().fieldErrors)

  const client = await getInsForgeServerClient()
  const { error } = await client.auth.resendVerificationEmail({
    email: parsed.data.email,
  })
  if (error) {
    return {
      ok: false,
      message: authErrorMessage(
        error,
        'Could not resend the code. Please try again shortly.',
      ),
    }
  }
  return {
    ok: true,
    step: 'verify-email',
    email: parsed.data.email,
    message: 'A fresh verification code has been sent.',
  }
}

export async function requestPasswordReset(
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return validationFailure(parsed.error.flatten().fieldErrors)

  const client = await getInsForgeServerClient()
  const { error } = await client.auth.sendResetPasswordEmail({
    email: parsed.data.email,
  })
  if (error) {
    return {
      ok: false,
      message: authErrorMessage(
        error,
        'Could not send a reset code. Please try again shortly.',
      ),
    }
  }

  return {
    ok: true,
    step: 'reset-code',
    email: parsed.data.email,
    message:
      'If an account exists for this Gmail, a 6-digit reset code has been sent.',
  }
}

export async function verifyPasswordResetCode(
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = resetCodeSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return validationFailure(parsed.error.flatten().fieldErrors)

  const client = await getInsForgeServerClient()
  const { data, error } = await client.auth.exchangeResetPasswordToken({
    email: parsed.data.email,
    code: parsed.data.code,
  })
  if (error || !data?.token) {
    return {
      ok: false,
      message: authErrorMessage(
        error,
        'That reset code is invalid or expired.',
      ),
    }
  }

  const expiresAt = Date.parse(data.expiresAt)
  const maxAge = Number.isFinite(expiresAt)
    ? Math.max(60, Math.floor((expiresAt - Date.now()) / 1000))
    : 600
  const cookieStore = await cookies()
  cookieStore.set('whappi_reset_token', data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/login',
    maxAge,
  })

  return {
    ok: true,
    step: 'new-password',
    email: parsed.data.email,
    message: 'Code confirmed. Choose your new password.',
  }
}

export async function saveNewPassword(
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return validationFailure(parsed.error.flatten().fieldErrors)

  const cookieStore = await cookies()
  const resetToken = cookieStore.get('whappi_reset_token')?.value
  if (!resetToken) {
    return {
      ok: false,
      step: 'reset-code',
      message: 'Your reset session expired. Request a new code.',
    }
  }

  const client = await getInsForgeServerClient()
  const { error } = await client.auth.resetPassword({
    newPassword: parsed.data.password,
    otp: resetToken,
  })
  if (error) {
    return {
      ok: false,
      message: authErrorMessage(
        error,
        'Could not update your password. Request a new code and try again.',
      ),
    }
  }

  cookieStore.delete('whappi_reset_token')
  return {
    ok: true,
    step: 'login',
    message: 'Password updated. You can now sign in.',
  }
}

export async function logout() {
  const auth = await getInsForgeAuthActions()
  await auth.signOut()
  redirect('/login')
}
