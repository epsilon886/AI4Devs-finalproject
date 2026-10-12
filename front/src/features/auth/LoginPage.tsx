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
const invalidCredentialsMessage = 'El correo electrónico o la contraseña son incorrectos.'
const rateLimitMessage = 'Demasiados intentos. Inténtalo de nuevo más tarde.'
const validationErrorMessage = 'Revisa los datos ingresados.'
const technicalErrorMessage = 'No pudimos iniciar sesión. Inténtalo de nuevo.'
const registrationSuccessMessage = 'Tu cuenta fue creada correctamente.'

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
          let hasUnknownFieldError = false

          for (const fieldError of error.errors ?? []) {
            if (fieldError.field === 'email' || fieldError.field === 'password') {
              setError(fieldError.field, {
                type: 'server',
                message:
                  fieldError.field === 'email'
                    ? 'Revisa el correo electrónico.'
                    : 'Revisa la contraseña.',
              })
            } else {
              hasUnknownFieldError = true
            }
          }

          if (hasUnknownFieldError || !error.errors?.length) {
            setGeneralError(validationErrorMessage)
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
            Iniciar sesión
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Inicia sesión para gestionar tu proceso de selección.
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
              Correo electrónico
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
                required: 'El correo electrónico es obligatorio.',
                validate: {
                  format: (value) =>
                    emailPattern.test(value.trim()) || 'Ingresa un correo electrónico válido.',
                  maximumLength: (value) =>
                    value.trim().length <= 200 || 'El correo electrónico debe tener como máximo 200 caracteres.',
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
              Contraseña
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
                  required: 'La contraseña es obligatoria.',
                  minLength: {
                    value: 15,
                    message: 'La contraseña debe tener al menos 15 caracteres.',
                  },
                  maxLength: {
                    value: 128,
                    message: 'La contraseña debe tener como máximo 128 caracteres.',
                  },
                })}
              />
              <button
                aria-label={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-blue-700 hover:text-blue-900"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                type="button"
              >
                {isPasswordVisible ? 'Ocultar' : 'Mostrar'}
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
              Iniciar sesión
            </button>
            <p className="text-center text-sm text-slate-600">
              ¿No tienes una cuenta?{' '}
              <Link className="font-medium text-blue-700 hover:text-blue-900" to="/register">
                Crear cuenta
              </Link>
            </p>
            {loginMutation.isPending ? (
              <p className="text-sm text-slate-600" role="status">
                Iniciando sesión...
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
