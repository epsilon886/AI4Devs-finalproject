import { useState } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  type RouterHistory,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { AppShell } from '../components/AppShell.tsx'
import { LoadingState } from '../components/LoadingState.tsx'
import { NotFoundPage } from '../components/NotFoundPage.tsx'
import {
  sessionQueryKey,
  sessionQueryOptions,
  type AuthenticatedUser,
  type Session,
} from '../features/auth/session.ts'
import { LoginPage } from '../features/auth/LoginPage.tsx'
import { RegisterPage } from '../features/auth/RegisterPage.tsx'
import { CandidatesPage } from '../features/candidates/CandidatesPage.tsx'
import { PipelineFormPage } from '../features/pipelines/PipelineFormPage.tsx'
import { clearPipelineCopy, PipelinesPage } from '../features/pipelines/PipelinesPage.tsx'
import { queryClient } from '../lib/query-client.ts'

export interface AppRouterOptions {
  queryClient: QueryClient
  history?: RouterHistory
}

const authenticatedRoutePaths = new Set(['/vacancies', '/candidates', '/pipelines'])

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const session = await getSession(context.queryClient)
    throw redirect({ to: session ? '/vacancies' : '/login' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: async ({ context }) => {
    if (await getSession(context.queryClient)) {
      throw redirect({ to: '/vacancies' })
    }
  },
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  beforeLoad: async ({ context }) => {
    if (await getSession(context.queryClient)) {
      throw redirect({ to: '/vacancies' })
    }
  },
  component: RegisterPage,
})

const vacanciesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vacancies',
  beforeLoad: async ({ context }) => ({
    user: requireSession(await getSession(context.queryClient)),
  }),
  component: VacanciesPlaceholder,
})

const candidatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/candidates',
  beforeLoad: async ({ context }) => ({
    user: requireSession(await getSession(context.queryClient)),
  }),
  component: CandidatesRoute,
})

const pipelinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pipelines',
  beforeLoad: async ({ context }) => ({
    user: requireSession(await getSession(context.queryClient)),
  }),
  component: PipelinesRoute,
})

const pipelinesFormRoute = createRoute({
  getParentRoute: () => pipelinesRoute,
  path: 'form',
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
  component: PipelinesFormRoute,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  vacanciesRoute,
  candidatesRoute,
  pipelinesRoute.addChildren([pipelinesFormRoute]),
])

export function createAppRouter({ queryClient, history }: AppRouterOptions) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history,
    defaultPendingComponent: LoadingState,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultErrorComponent: ({ reset }) => <SessionResolutionError reset={reset} />,
    defaultNotFoundComponent: ContextualNotFoundPage,
  })
}

export const router = createAppRouter({ queryClient })

export function isAuthenticatedRoute(pathname: string): boolean {
  return authenticatedRoutePaths.has(pathname) || pathname.startsWith('/pipelines/')
}

function getSession(queryClient: QueryClient): Promise<Session> {
  return queryClient.ensureQueryData(sessionQueryOptions)
}

function requireSession(session: Session): AuthenticatedUser {
  if (!session) {
    throw redirect({ to: '/login' })
  }

  return session
}

function SessionResolutionError({ reset }: { reset?: () => void }) {
  const router = useRouter()

  function handleRetry() {
    router.options.context.queryClient.removeQueries({ queryKey: sessionQueryKey })
    reset?.()
    void router.invalidate()
  }

  return (
    <main>
      <p>No pudimos cargar la sesión.</p>
      <button onClick={handleRetry} type="button">
        Reintentar
      </button>
    </main>
  )
}

function ContextualNotFoundPage() {
  const { data: session, error, isPending } = useQuery(sessionQueryOptions)

  if (isPending) {
    return <LoadingState />
  }

  if (error) {
    return <SessionResolutionError />
  }

  const destination = session ? '/vacancies' : '/login'
  const label = session ? 'Ir a Vacantes' : 'Ir a Iniciar sesión'

  return <NotFoundPage action={<Link to={destination}>{label}</Link>} />
}

function VacanciesPlaceholder() {
  const { user } = vacanciesRoute.useRouteContext()

  return (
    <AppShell user={user}>
      <PlaceholderPage title="Vacantes" />
    </AppShell>
  )
}

function CandidatesRoute() {
  const { user } = candidatesRoute.useRouteContext()

  return (
    <AppShell user={user}>
      <CandidatesPage />
    </AppShell>
  )
}

function PipelinesRoute() {
  const { user } = pipelinesRoute.useRouteContext()
  const router = useRouter()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [form, setForm] = useState<{ id?: string } | null>(null)

  function closeForm() {
    setForm(null)
    void router.navigate({ to: '/pipelines' })
  }

  return (
    <AppShell user={user}>
      {form ? (
        <PipelineFormPage id={form.id} onBack={closeForm} />
      ) : pathname === '/pipelines/form' ? (
        <Outlet />
      ) : (
        <PipelinesPage
          onCopy={() => {
            setForm({})
            void router.navigate({ to: '/pipelines/form', search: { id: undefined } })
          }}
          onCreate={() => {
            clearPipelineCopy()
            setForm({})
            void router.navigate({ to: '/pipelines/form', search: { id: undefined } })
          }}
          onEdit={(id) => {
            clearPipelineCopy()
            setForm({ id })
            void router.navigate({ to: '/pipelines/form', search: { id } })
          }}
        />
      )}
    </AppShell>
  )
}

function PipelinesFormRoute() {
  const { id } = pipelinesFormRoute.useSearch()
  const router = useRouter()

  return (
    <PipelineFormPage
      id={id}
      onBack={() => {
        void router.navigate({ to: '/pipelines' })
      }}
    />
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <main>
      <h1>{title}</h1>
    </main>
  )
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
