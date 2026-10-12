import { useQuery, type QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  redirect,
  type RouterHistory,
  useRouter,
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
  component: CandidatesPlaceholder,
})

const pipelinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pipelines',
  beforeLoad: async ({ context }) => ({
    user: requireSession(await getSession(context.queryClient)),
  }),
  component: PipelinesPlaceholder,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  vacanciesRoute,
  candidatesRoute,
  pipelinesRoute,
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
  return authenticatedRoutePaths.has(pathname)
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
      <p>Unable to load the session.</p>
      <button onClick={handleRetry} type="button">
        Try again
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
  const label = session ? 'Go to Vacancies' : 'Go to Login'

  return <NotFoundPage action={<Link to={destination}>{label}</Link>} />
}

function VacanciesPlaceholder() {
  const { user } = vacanciesRoute.useRouteContext()

  return (
    <AppShell user={user}>
      <PlaceholderPage title="Vacancies" />
    </AppShell>
  )
}

function CandidatesPlaceholder() {
  const { user } = candidatesRoute.useRouteContext()

  return (
    <AppShell user={user}>
      <PlaceholderPage title="Candidates" />
    </AppShell>
  )
}

function PipelinesPlaceholder() {
  const { user } = pipelinesRoute.useRouteContext()

  return (
    <AppShell user={user}>
      <PlaceholderPage title="Pipelines" />
    </AppShell>
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
