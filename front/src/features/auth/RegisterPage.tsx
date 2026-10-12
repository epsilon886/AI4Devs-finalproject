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
const registrationConflictMessage = 'Unable to create account with the provided information'
const rateLimitMessage = 'Too many requests. Please try again later.'
const technicalErrorMessage = 'Unable to register. Try again.'

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
          let hasGeneralError = false

          for (const fieldError of error.errors ?? []) {
            if (
              fieldError.field === 'firstName' ||
              fieldError.field === 'lastName' ||
              fieldError.field === 'email' ||
              fieldError.field === 'password'
            ) {
              setError(fieldError.field, { type: 'server', message: fieldError.message })
            } else if (!hasGeneralError) {
              setToastMessage(fieldError.message)
              hasGeneralError = true
            }
          }

          if (!hasGeneralError && !error.errors?.length) {
            setToastMessage(error.message)
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
          Register
        </h1>
        <p className="mt-2 text-sm text-slate-600">Create your RecruitLane account.</p>

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
              First name <span aria-hidden="true">*</span>
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
                required: 'First name is required',
                validate: {
                  notEmpty: (value) => value.trim().length > 0 || 'First name cannot be empty',
                  maximumLength: (value) =>
                    value.trim().length <= 100 || 'First name must be at most 100 characters',
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
              Last name <span aria-hidden="true">*</span>
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
                required: 'Last name is required',
                validate: {
                  notEmpty: (value) => value.trim().length > 0 || 'Last name cannot be empty',
                  maximumLength: (value) =>
                    value.trim().length <= 100 || 'Last name must be at most 100 characters',
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
              Email <span aria-hidden="true">*</span>
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
              <p className="mt-1 text-sm text-red-700" id="register-email-error" role="alert">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="register-password">
              Password <span aria-hidden="true">*</span>
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
              Confirm password <span aria-hidden="true">*</span>
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
                  required: 'Confirm password is required',
                  validate: (value) => value === getValues('password') || 'Passwords do not match',
                })}
              />
              <button
                aria-label={isConfirmationVisible ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-blue-700 hover:text-blue-900"
                onClick={() => setIsConfirmationVisible((visible) => !visible)}
                type="button"
              >
                {isConfirmationVisible ? 'Hide' : 'Show'}
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
              Cancel
            </button>
            <button
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              disabled={registerMutation.isPending}
              type="submit"
            >
              Register
            </button>
          </div>
          {registerMutation.isPending ? (
            <p className="text-sm text-slate-600" role="status">
              Registering...
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
