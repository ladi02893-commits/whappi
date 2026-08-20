'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useState, type HTMLAttributes } from 'react'
import {
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
  useForm,
} from 'react-hook-form'
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  resendRegistrationCode,
  saveNewPassword,
  verifyPasswordResetCode,
  verifyRegistrationEmail,
  type AuthActionResult,
} from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  emailVerificationSchema,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  registerSchema,
  resetCodeSchema,
  type EmailVerificationValues,
  type ForgotPasswordValues,
  type LoginValues,
  type NewPasswordValues,
  type RegisterValues,
  type ResetCodeValues,
} from '@/lib/auth-validation'
import { cn } from '@/lib/utils'

type AuthMode =
  | 'login'
  | 'register'
  | 'verify-email'
  | 'forgot-password'
  | 'reset-code'
  | 'new-password'

type FormProps = {
  onMode: (mode: AuthMode) => void
  onEmail: (email: string) => void
  onNotice: (message: string) => void
  email: string
  notice: string
}

function formDataOf(values: object) {
  const formData = new FormData()
  Object.entries(values).forEach(([key, value]) =>
    formData.set(key, String(value)),
  )
  return formData
}

function FormNotice({ result }: { result: AuthActionResult | null }) {
  if (!result) return null
  return (
    <div
      role={result.ok ? 'status' : 'alert'}
      className={cn(
        'mt-4 flex gap-2 rounded-xl border px-3 py-2.5 text-sm',
        result.ok
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-destructive/25 bg-destructive/10 text-destructive',
      )}
    >
      {result.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{result.message}</span>
    </div>
  )
}

function FieldError<T extends FieldValues>({
  name,
  errors,
  serverResult,
}: {
  name: Path<T>
  errors: FieldErrors<T>
  serverResult: AuthActionResult | null
}) {
  const clientError = errors[name]?.message
  const serverError = serverResult?.fieldErrors?.[name]?.[0]
  const message =
    typeof clientError === 'string' ? clientError : (serverError ?? null)
  return message ? (
    <p className="mt-1.5 text-xs text-destructive">{message}</p>
  ) : null
}

function FormField<T extends FieldValues>({
  id,
  label,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  icon: Icon,
  register,
  errors,
  serverResult,
}: {
  id: Path<T>
  label: string
  type?: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  placeholder?: string
  icon: typeof Mail
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  serverResult: AuthActionResult | null
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          maxLength={inputMode === 'numeric' ? 6 : undefined}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="h-12 pl-10"
          aria-invalid={Boolean(errors[id] || serverResult?.fieldErrors?.[id])}
          {...register(id)}
        />
      </div>
      <FieldError<T> name={id} errors={errors} serverResult={serverResult} />
    </div>
  )
}

function PasswordField<T extends FieldValues>({
  id,
  label,
  autoComplete,
  register,
  errors,
  serverResult,
}: {
  id: Path<T>
  label: string
  autoComplete: string
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  serverResult: AuthActionResult | null
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <LockKeyhole className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="h-12 px-10"
          aria-invalid={Boolean(errors[id] || serverResult?.fieldErrors?.[id])}
          {...register(id)}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute right-1 top-1 grid size-10 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <FieldError<T> name={id} errors={errors} serverResult={serverResult} />
    </div>
  )
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-12 w-full justify-between rounded-xl px-4"
    >
      <span>{pending ? 'Please wait…' : label}</span>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <ArrowRight className="size-4" />
      )}
    </Button>
  )
}

function LoginForm({ onMode, notice }: FormProps) {
  const [result, setResult] = useState<AuthActionResult | null>(
    notice ? { ok: true, message: notice } : null,
  )
  const [pending, setPending] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const submit = handleSubmit(async (values) => {
    setPending(true)
    setResult(null)
    try {
      setResult(await loginWithPassword(formDataOf(values)))
    } finally {
      setPending(false)
    }
  })

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <FormField<LoginValues>
        id="email"
        label="Gmail"
        type="email"
        autoComplete="email"
        placeholder="you@gmail.com"
        icon={Mail}
        register={register}
        errors={errors}
        serverResult={result}
      />
      <PasswordField<LoginValues>
        id="password"
        label="Password"
        autoComplete="current-password"
        register={register}
        errors={errors}
        serverResult={result}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onMode('forgot-password')}
          className="text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Forgot password?
        </button>
      </div>
      <FormNotice result={result} />
      <SubmitButton pending={pending} label="Sign in" />
      <p className="text-center text-sm text-muted-foreground">
        New to WHAPPI?{' '}
        <button
          type="button"
          onClick={() => onMode('register')}
          className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Create account
        </button>
      </p>
    </form>
  )
}

function RegisterForm({ onMode, onEmail, onNotice }: FormProps) {
  const [result, setResult] = useState<AuthActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  const submit = handleSubmit(async (values) => {
    setPending(true)
    setResult(null)
    try {
      const next = await registerWithPassword(formDataOf(values))
      setResult(next)
      if (next.ok && next.step === 'verify-email' && next.email) {
        onEmail(next.email)
        onNotice(next.message)
        onMode('verify-email')
      }
    } finally {
      setPending(false)
    }
  })

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <FormField<RegisterValues>
        id="fullName"
        label="Full name"
        autoComplete="name"
        placeholder="Your full name"
        icon={UserRound}
        register={register}
        errors={errors}
        serverResult={result}
      />
      <FormField<RegisterValues>
        id="email"
        label="Gmail"
        type="email"
        autoComplete="email"
        placeholder="you@gmail.com"
        icon={Mail}
        register={register}
        errors={errors}
        serverResult={result}
      />
      <PasswordField<RegisterValues>
        id="password"
        label="Password"
        autoComplete="new-password"
        register={register}
        errors={errors}
        serverResult={result}
      />
      <PasswordField<RegisterValues>
        id="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        register={register}
        errors={errors}
        serverResult={result}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        Use at least 8 characters with uppercase, lowercase, and a number.
      </p>
      <FormNotice result={result} />
      <SubmitButton pending={pending} label="Create account" />
      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <button
          type="button"
          onClick={() => onMode('login')}
          className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign in
        </button>
      </p>
    </form>
  )
}

function VerifyEmailForm({ email, notice, onMode, onNotice }: FormProps) {
  const [result, setResult] = useState<AuthActionResult | null>(
    notice ? { ok: true, message: notice } : null,
  )
  const [pending, setPending] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailVerificationValues>({
    resolver: zodResolver(emailVerificationSchema),
    defaultValues: { email },
  })

  const submit = handleSubmit(async (values) => {
    setPending(true)
    setResult(null)
    try {
      setResult(await verifyRegistrationEmail(formDataOf(values)))
    } finally {
      setPending(false)
    }
  })

  async function resend() {
    setPending(true)
    try {
      const next = await resendRegistrationCode(email)
      setResult(next)
      if (next.ok) onNotice(next.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <input type="hidden" {...register('email')} />
      <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
        Code sent to <strong className="text-foreground">{email}</strong>
      </p>
      <FormField<EmailVerificationValues>
        id="code"
        label="Verification code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        icon={ShieldCheck}
        register={register}
        errors={errors}
        serverResult={result}
      />
      <FormNotice result={result} />
      <SubmitButton pending={pending} label="Verify Gmail" />
      <div className="flex justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={() => onMode('register')}
          className="font-semibold text-muted-foreground hover:text-foreground"
        >
          Change Gmail
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={resend}
          className="font-semibold text-primary hover:underline disabled:opacity-50"
        >
          Resend code
        </button>
      </div>
    </form>
  )
}

function ForgotPasswordForm({ onMode, onEmail, onNotice }: FormProps) {
  const [result, setResult] = useState<AuthActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const submit = handleSubmit(async (values) => {
    setPending(true)
    setResult(null)
    try {
      const next = await requestPasswordReset(formDataOf(values))
      setResult(next)
      if (next.ok && next.step === 'reset-code' && next.email) {
        onEmail(next.email)
        onNotice(next.message)
        onMode('reset-code')
      }
    } finally {
      setPending(false)
    }
  })

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <FormField<ForgotPasswordValues>
        id="email"
        label="Registered Gmail"
        type="email"
        autoComplete="email"
        placeholder="you@gmail.com"
        icon={Mail}
        register={register}
        errors={errors}
        serverResult={result}
      />
      <FormNotice result={result} />
      <SubmitButton pending={pending} label="Send reset code" />
      <button
        type="button"
        onClick={() => onMode('login')}
        className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sign in
      </button>
    </form>
  )
}

function ResetCodeForm({ email, notice, onMode, onNotice }: FormProps) {
  const [result, setResult] = useState<AuthActionResult | null>(
    notice ? { ok: true, message: notice } : null,
  )
  const [pending, setPending] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetCodeValues>({
    resolver: zodResolver(resetCodeSchema),
    defaultValues: { email },
  })

  const submit = handleSubmit(async (values) => {
    setPending(true)
    setResult(null)
    try {
      const next = await verifyPasswordResetCode(formDataOf(values))
      setResult(next)
      if (next.ok && next.step === 'new-password') {
        onNotice(next.message)
        onMode('new-password')
      }
    } finally {
      setPending(false)
    }
  })

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <input type="hidden" {...register('email')} />
      <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
        Reset code sent to <strong className="text-foreground">{email}</strong>
      </p>
      <FormField<ResetCodeValues>
        id="code"
        label="Reset code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        icon={KeyRound}
        register={register}
        errors={errors}
        serverResult={result}
      />
      <FormNotice result={result} />
      <SubmitButton pending={pending} label="Confirm code" />
      <button
        type="button"
        onClick={() => onMode('forgot-password')}
        className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Request another code
      </button>
    </form>
  )
}

function NewPasswordForm({ notice, onMode, onNotice }: FormProps) {
  const [result, setResult] = useState<AuthActionResult | null>(
    notice ? { ok: true, message: notice } : null,
  )
  const [pending, setPending] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema) })

  const submit = handleSubmit(async (values) => {
    setPending(true)
    setResult(null)
    try {
      const next = await saveNewPassword(formDataOf(values))
      setResult(next)
      if (next.ok && next.step === 'login') {
        onMode('login')
        onNotice(next.message)
      } else if (!next.ok && next.step === 'reset-code') {
        onNotice(next.message)
        onMode('forgot-password')
      }
    } finally {
      setPending(false)
    }
  })

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <PasswordField<NewPasswordValues>
        id="password"
        label="New password"
        autoComplete="new-password"
        register={register}
        errors={errors}
        serverResult={result}
      />
      <PasswordField<NewPasswordValues>
        id="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        register={register}
        errors={errors}
        serverResult={result}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        Use at least 8 characters with uppercase, lowercase, and a number.
      </p>
      <FormNotice result={result} />
      <SubmitButton pending={pending} label="Save new password" />
    </form>
  )
}

const copy: Record<AuthMode, { eyebrow: string; title: string; body: string }> =
  {
    login: {
      eyebrow: 'Welcome back',
      title: 'Sign in to WHAPPI',
      body: 'Use your Gmail and password to continue your conversations.',
    },
    register: {
      eyebrow: 'Join WHAPPI',
      title: 'Create your account',
      body: 'Register with your full name and Gmail. We will verify your email before opening chat.',
    },
    'verify-email': {
      eyebrow: 'One quick check',
      title: 'Verify your Gmail',
      body: 'Enter the 6-digit code from your verification email.',
    },
    'forgot-password': {
      eyebrow: 'Account recovery',
      title: 'Forgot your password?',
      body: 'Enter your registered Gmail and we will send a secure reset code.',
    },
    'reset-code': {
      eyebrow: 'Account recovery',
      title: 'Enter reset code',
      body: 'Use the 6-digit code from your password reset email.',
    },
    'new-password': {
      eyebrow: 'Almost done',
      title: 'Choose a new password',
      body: 'Create a strong password you have not used for this account before.',
    },
  }

export function AuthPanel() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const current = copy[mode]

  function changeMode(next: AuthMode) {
    setMode(next)
    if (
      next !== 'verify-email' &&
      next !== 'reset-code' &&
      next !== 'new-password'
    )
      setNotice('')
  }

  const props: FormProps = {
    onMode: changeMode,
    onEmail: setEmail,
    onNotice: setNotice,
    email,
    notice,
  }

  return (
    <div className="w-full max-w-md">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
        {current.eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-[var(--font-display)] font-extrabold sm:text-4xl">
        {current.title}
      </h2>
      <p className="mt-3 leading-7 text-muted-foreground">{current.body}</p>

      {mode === 'login' && <LoginForm {...props} />}
      {mode === 'register' && <RegisterForm {...props} />}
      {mode === 'verify-email' && <VerifyEmailForm {...props} />}
      {mode === 'forgot-password' && <ForgotPasswordForm {...props} />}
      {mode === 'reset-code' && <ResetCodeForm {...props} />}
      {mode === 'new-password' && <NewPasswordForm {...props} />}
    </div>
  )
}
