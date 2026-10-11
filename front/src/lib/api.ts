export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface ApiRequestOptions {
  method?: ApiMethod
  body?: unknown
}

export interface ApiFieldError {
  field: string
  message: string
}

export class ApiHttpError extends Error {
  readonly status: number
  readonly code?: string
  readonly errors?: ApiFieldError[]

  constructor({
    status,
    code,
    message,
    errors,
  }: {
    status: number
    code?: string
    message: string
    errors?: ApiFieldError[]
  }) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
    this.code = code
    this.errors = errors
  }
}

export class ApiNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiNetworkError'
  }
}

export type UnauthorizedHandler = (error: ApiHttpError) => void

const MUTATING_METHODS = new Set<ApiMethod>(['POST', 'PATCH', 'DELETE'])

let unauthorizedHandler: UnauthorizedHandler | undefined

export function setUnauthorizedHandler(handler?: UnauthorizedHandler): void {
  unauthorizedHandler = handler
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}

  if (MUTATING_METHODS.has(method)) {
    headers['X-CSRF-Protection'] = '1'
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response

  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiNetworkError('Network request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  if (response.ok) {
    return (await response.json()) as T
  }

  const error = toApiHttpError(response, await readJson(response))

  if (error.status === 401 && error.code === 'UNAUTHORIZED') {
    notifyUnauthorized(error)
  }

  throw error
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function toApiHttpError(response: Response, payload: unknown): ApiHttpError {
  if (isContractualError(payload, response.status)) {
    return new ApiHttpError({
      status: payload.statusCode,
      code: payload.code,
      message: payload.message,
      errors: toFieldErrors(payload.errors),
    })
  }

  return new ApiHttpError({
    status: response.status,
    message: 'Request failed',
  })
}

function isContractualError(
  payload: unknown,
  status: number,
): payload is {
  statusCode: number
  code: string
  message: string
  errors?: unknown
} {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'statusCode' in payload &&
    payload.statusCode === status &&
    'code' in payload &&
    typeof payload.code === 'string' &&
    'message' in payload &&
    typeof payload.message === 'string'
  )
}

function toFieldErrors(errors: unknown): ApiFieldError[] | undefined {
  if (!Array.isArray(errors)) {
    return undefined
  }

  const fieldErrors = errors.filter(
    (error): error is ApiFieldError =>
      typeof error === 'object' &&
      error !== null &&
      'field' in error &&
      typeof error.field === 'string' &&
      'message' in error &&
      typeof error.message === 'string',
  )

  return fieldErrors.length === errors.length ? fieldErrors : undefined
}

function notifyUnauthorized(error: ApiHttpError): void {
  try {
    unauthorizedHandler?.(error)
  } catch {
    // A future session handler must not replace the original HTTP error.
  }
}
