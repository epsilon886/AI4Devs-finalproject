import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useRouter, type HistoryState } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { Toast, type ToastType } from '../../components/Toast.tsx'
import { ApiHttpError, ApiNetworkError, apiRequest } from '../../lib/api.ts'
import { sessionQueryKey, type AuthenticatedUser } from './session.ts'

interface LoginFormValues {
  email: string
  password: string
}

const emailPattern = /^[^\s@]+@[^\s@]+$/
const invalidCredentialsMessage = 'Invalid email or password'
const rateLimitMessage = 'Too many requests. Please try again later.'
const technicalErrorMessage = 'Unable to log in. Try again.'
const registrationSuccessMessage = 'Account created successfully'

interface ToastState {
  type: ToastType
  message: string
}

export function LoginPage() {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const router = useRouter()
  const registrationSucceeded = useLocation({
    select: (location) =>
      (location.state as HistoryState & { registrationSucceeded?: boolean })
        .registrationSucceeded === true,
  })
  const [toast, setToast] = useState<ToastState | null>(() =>
    registrationSucceeded ? { type: 'success', message: registrationSuccessMessage } : null,
  )
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginFormValues>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  useEffect(() => {
    if (!registrationSucceeded) {
      return
    }

    void router.navigate({ to: '/login', replace: true, state: () => ({}) })
  }, [registrationSucceeded, router])

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginFormValues) =>
      apiRequest<AuthenticatedUser>('/auth/login', {
        method: 'POST',
        body: credentials,
      }),
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user)
      void router.navigate({ to: '/vacancies', replace: true })
    },
    onMutate: () => {
      clearErrors(['email', 'password'])
      setGeneralError(null)
      setToast(null)
    },
    onError: (error) => {
      if (error instanceof ApiHttpError) {
        if (error.status === 401 && error.code === 'INVALID_CREDENTIALS') {
          setGeneralError(invalidCredentialsMessage)
          return
        }

        if (error.status === 429 && error.code === 'RATE_LIMIT_EXCEEDED') {
          setGeneralError(rateLimitMessage)
          return
        }

        if (error.status === 400 && error.code === 'VALIDATION_ERROR') {
          let hasGeneralError = false

          for (const fieldError of error.errors ?? []) {
            if (fieldError.field === 'email' || fieldError.field === 'password') {
              setError(fieldError.field, { type: 'server', message: fieldError.message })
            } else if (!hasGeneralError) {
              setGeneralError(fieldError.message)
              hasGeneralError = true
            }
          }

          if (!hasGeneralError && !error.errors?.length) {
            setGeneralError(error.message)
          }
          return
        }
      }

      if (error instanceof ApiNetworkError) {
        setToast({ type: 'error', message: technicalErrorMessage })
        return
      }

      setToast({ type: 'error', message: technicalErrorMessage })
    },
  })

  return (
    <>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-slate-900" id="login-heading">
            Login
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to manage your recruiting workflow.
          </p>

          <form
            aria-labelledby="login-heading"
            className="mt-6 space-y-5"
            noValidate
            onSubmit={handleSubmit((credentials) => {
              if (!loginMutation.isPending) {
                loginMutation.mutate(credentials)
              }
            })}
          >
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="login-email">
              Email
            </label>
            <input
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              aria-invalid={errors.email ? true : undefined}
              autoComplete="email"
              className={[
                'mt-1 w-full rounded-md border px-3 py-2 text-slate-900 outline-none transition',
                errors.email
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-600',
              ].join(' ')}
              id="login-email"
              maxLength={200}
              type="email"
              {...register('email', {
                required: 'Email is required',
                validate: {
                  format: (value) =>
                    emailPattern.test(value.trim()) || 'Enter a valid email address',
                  maximumLength: (value) =>
                    value.trim().length <= 200 || 'Email must be at most 200 characters',
                },
              })}
            />
            {errors.email ? (
              <p className="mt-1 text-sm text-red-700" id="login-email-error" role="alert">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="login-password">
              Password
            </label>
            <div className="relative mt-1">
              <input
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                aria-invalid={errors.password ? true : undefined}
                autoComplete="current-password"
                className={[
                  'w-full rounded-md border px-3 py-2 pr-20 text-slate-900 outline-none transition',
                  errors.password
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-slate-300 focus:border-blue-600',
                ].join(' ')}
                id="login-password"
                maxLength={128}
                type={isPasswordVisible ? 'text' : 'password'}
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 15,
                    message: 'Password must be at least 15 characters',
                  },
                  maxLength: {
                    value: 128,
                    message: 'Password must be at most 128 characters',
                  },
                })}
              />
              <button
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-blue-700 hover:text-blue-900"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                type="button"
              >
                {isPasswordVisible ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password ? (
              <p className="mt-1 text-sm text-red-700" id="login-password-error" role="alert">
                {errors.password.message}
              </p>
            ) : null}
          </div>

            {generalError ? (
              <p className="text-sm text-red-700" role="alert">
                {generalError}
              </p>
            ) : null}

            <button
              className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              disabled={loginMutation.isPending}
              type="submit"
            >
              Log in
            </button>
            <p className="text-center text-sm text-slate-600">
              Need an account?{' '}
              <Link className="font-medium text-blue-700 hover:text-blue-900" to="/register">
                Register
              </Link>
            </p>
            {loginMutation.isPending ? (
              <p className="text-sm text-slate-600" role="status">
                Logging in...
              </p>
            ) : null}
          </form>
        </section>
      </main>
      {toast ? (
        <Toast message={toast.message} onClose={() => setToast(null)} type={toast.type} />
      ) : null}
    </>
  )
}
