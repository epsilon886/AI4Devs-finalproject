import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useRouter, type HistoryState } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { Toast } from '../../components/Toast.tsx'
import { ApiHttpError, ApiNetworkError, apiRequest } from '../../lib/api.ts'

interface RegisterFormValues {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
}

const emailPattern = /^[^\s@]+@[^\s@]+$/
const registrationConflictMessage = 'No fue posible crear la cuenta con los datos proporcionados.'
const rateLimitMessage = 'Demasiados intentos. Inténtalo de nuevo más tarde.'
const validationErrorMessage = 'Revisa los datos ingresados.'
const technicalErrorMessage = 'No pudimos crear la cuenta. Inténtalo de nuevo.'

export function RegisterPage() {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const router = useRouter()
  const {
    clearErrors,
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    setError,
  } = useForm<RegisterFormValues>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const registerMutation = useMutation({
    mutationFn: ({ firstName, lastName, email, password }: RegisterFormValues) =>
      apiRequest('/auth/register', {
        method: 'POST',
        body: { firstName, lastName, email, password },
      }),
    onSuccess: () => {
      void router.navigate({
        to: '/login',
        replace: true,
        state: { registrationSucceeded: true } as HistoryState,
      })
    },
    onMutate: () => {
      clearErrors(['firstName', 'lastName', 'email', 'password'])
      setToastMessage(null)
    },
    onError: (error) => {
      if (error instanceof ApiHttpError) {
        if (error.status === 409 && error.code === 'REGISTRATION_CONFLICT') {
          setToastMessage(registrationConflictMessage)
          return
        }

        if (error.status === 429 && error.code === 'RATE_LIMIT_EXCEEDED') {
          setToastMessage(rateLimitMessage)
          return
        }

        if (error.status === 400 && error.code === 'VALIDATION_ERROR') {
          let hasUnknownFieldError = false

          for (const fieldError of error.errors ?? []) {
            if (
              fieldError.field === 'firstName' ||
              fieldError.field === 'lastName' ||
              fieldError.field === 'email' ||
              fieldError.field === 'password'
            ) {
              setError(fieldError.field, {
                type: 'server',
                message: {
                  firstName: 'Revisa el nombre.',
                  lastName: 'Revisa el apellido.',
                  email: 'Revisa el correo electrónico.',
                  password: 'Revisa la contraseña.',
                }[fieldError.field],
              })
            } else {
              hasUnknownFieldError = true
            }
          }

          if (hasUnknownFieldError || !error.errors?.length) {
            setToastMessage(validationErrorMessage)
          }
          return
        }
      }

      if (error instanceof ApiNetworkError) {
        setToastMessage(technicalErrorMessage)
        return
      }

      setToastMessage(technicalErrorMessage)
    },
  })

  return (
    <>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900" id="register-heading">
          Crear cuenta
        </h1>
        <p className="mt-2 text-sm text-slate-600">Crea tu cuenta de RecruitLane.</p>

        <form
          aria-labelledby="register-heading"
          className="mt-6 space-y-5"
          noValidate
          onSubmit={handleSubmit((values) => {
            if (!registerMutation.isPending) {
              registerMutation.mutate(values)
            }
          })}
        >
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="register-first-name">
              Nombre <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={errors.firstName ? 'register-first-name-error' : undefined}
              aria-invalid={errors.firstName ? true : undefined}
              autoComplete="given-name"
              className={[
                'mt-1 w-full rounded-md border px-3 py-2 text-slate-900 outline-none transition',
                errors.firstName
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-600',
              ].join(' ')}
              id="register-first-name"
              maxLength={100}
              type="text"
              {...register('firstName', {
                required: 'El nombre es obligatorio.',
                validate: {
                  notEmpty: (value) => value.trim().length > 0 || 'El nombre no puede estar vacío.',
                  maximumLength: (value) =>
                    value.trim().length <= 100 || 'El nombre debe tener como máximo 100 caracteres.',
                },
              })}
            />
            {errors.firstName ? (
              <p className="mt-1 text-sm text-red-700" id="register-first-name-error" role="alert">
                {errors.firstName.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="register-last-name">
              Apellido <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={errors.lastName ? 'register-last-name-error' : undefined}
              aria-invalid={errors.lastName ? true : undefined}
              autoComplete="family-name"
              className={[
                'mt-1 w-full rounded-md border px-3 py-2 text-slate-900 outline-none transition',
                errors.lastName
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-600',
              ].join(' ')}
              id="register-last-name"
              maxLength={100}
              type="text"
              {...register('lastName', {
                required: 'El apellido es obligatorio.',
                validate: {
                  notEmpty: (value) => value.trim().length > 0 || 'El apellido no puede estar vacío.',
                  maximumLength: (value) =>
                    value.trim().length <= 100 || 'El apellido debe tener como máximo 100 caracteres.',
                },
              })}
            />
            {errors.lastName ? (
              <p className="mt-1 text-sm text-red-700" id="register-last-name-error" role="alert">
                {errors.lastName.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="register-email">
              Correo electrónico <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={errors.email ? 'register-email-error' : undefined}
              aria-invalid={errors.email ? true : undefined}
              autoComplete="email"
              className={[
                'mt-1 w-full rounded-md border px-3 py-2 text-slate-900 outline-none transition',
                errors.email
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-600',
              ].join(' ')}
              id="register-email"
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
              <p className="mt-1 text-sm text-red-700" id="register-email-error" role="alert">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="register-password">
              Contraseña <span aria-hidden="true">*</span>
            </label>
            <div className="relative mt-1">
              <input
                aria-describedby={errors.password ? 'register-password-error' : undefined}
                aria-invalid={errors.password ? true : undefined}
                autoComplete="new-password"
                className={[
                  'w-full rounded-md border px-3 py-2 pr-20 text-slate-900 outline-none transition',
                  errors.password
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-slate-300 focus:border-blue-600',
                ].join(' ')}
                id="register-password"
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
              <p className="mt-1 text-sm text-red-700" id="register-password-error" role="alert">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="block text-sm font-medium text-slate-800"
              htmlFor="register-confirm-password"
            >
              Confirmar contraseña <span aria-hidden="true">*</span>
            </label>
            <div className="relative mt-1">
              <input
                aria-describedby={errors.confirmPassword ? 'register-confirm-password-error' : undefined}
                aria-invalid={errors.confirmPassword ? true : undefined}
                autoComplete="new-password"
                className={[
                  'w-full rounded-md border px-3 py-2 pr-20 text-slate-900 outline-none transition',
                  errors.confirmPassword
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-slate-300 focus:border-blue-600',
                ].join(' ')}
                id="register-confirm-password"
                type={isConfirmationVisible ? 'text' : 'password'}
                {...register('confirmPassword', {
                  required: 'La confirmación de contraseña es obligatoria.',
                  validate: (value) => value === getValues('password') || 'Las contraseñas no coinciden.',
                })}
              />
              <button
                aria-label={
                  isConfirmationVisible ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'
                }
                className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-blue-700 hover:text-blue-900"
                onClick={() => setIsConfirmationVisible((visible) => !visible)}
                type="button"
              >
                {isConfirmationVisible ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {errors.confirmPassword ? (
              <p
                className="mt-1 text-sm text-red-700"
                id="register-confirm-password-error"
                role="alert"
              >
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <button
              className="flex-1 rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              disabled={registerMutation.isPending}
              onClick={() => void router.navigate({ to: '/login' })}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              disabled={registerMutation.isPending}
              type="submit"
            >
              Crear cuenta
            </button>
          </div>
          {registerMutation.isPending ? (
            <p className="text-sm text-slate-600" role="status">
              Creando cuenta...
            </p>
          ) : null}
        </form>
        </section>
      </main>
      {toastMessage ? (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} type="error" />
      ) : null}
    </>
  )
}
