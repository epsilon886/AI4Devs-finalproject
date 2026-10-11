import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import type { AuthenticatedUser } from '../features/auth/session.ts'
import { logout } from '../features/auth/session.ts'
import { Toast } from './Toast.tsx'

export interface AppShellProps {
  user: AuthenticatedUser
  children: ReactNode
}

const navigationItems = [
  { to: '/vacancies', label: 'Vacancies' },
  { to: '/candidates', label: 'Candidates' },
  { to: '/pipelines', label: 'Pipelines' },
] as const

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AppShell({ user, children }: AppShellProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false)
  const navigationToggleRef = useRef<HTMLButtonElement>(null)
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const wasMobileNavigationOpen = useRef(false)
  const logoutMutation = useMutation({
    mutationFn: () =>
      logout({
        queryClient,
        onSessionEnded: () => {
          void router.navigate({ to: '/login', replace: true })
        },
      }),
  })

  useEffect(() => {
    if (isMobileNavigationOpen) {
      drawerCloseButtonRef.current?.focus()
    } else if (wasMobileNavigationOpen.current) {
      navigationToggleRef.current?.focus()
    }

    wasMobileNavigationOpen.current = isMobileNavigationOpen
  }, [isMobileNavigationOpen])

  function closeMobileNavigation() {
    setIsMobileNavigationOpen(false)
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') {
      return
    }

    const drawer = drawerRef.current
    if (!drawer) {
      return
    }

    const focusableElements = Array.from(
      drawer.querySelectorAll<HTMLElement>(focusableSelector),
    )

    if (focusableElements.length === 0) {
      event.preventDefault()
      drawer.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement

    if (
      event.shiftKey &&
      (activeElement === firstElement || !drawer.contains(activeElement))
    ) {
      event.preventDefault()
      lastElement.focus()
    }

    if (
      !event.shiftKey &&
      (activeElement === lastElement || !drawer.contains(activeElement))
    ) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            aria-controls="mobile-navigation"
            aria-expanded={isMobileNavigationOpen}
            aria-label="Open navigation"
            className="rounded-md p-2 text-slate-700 hover:bg-slate-100 md:hidden"
            onClick={() => setIsMobileNavigationOpen(true)}
            ref={navigationToggleRef}
            type="button"
          >
            <span aria-hidden="true">☰</span>
          </button>
          <span className="text-lg font-semibold text-slate-900">RecruitLane</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-700">
            {user.firstName} {user.lastName}
          </span>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            type="button"
          >
            {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-65px)] bg-slate-50">
        <aside className="hidden border-r border-slate-200 bg-white p-4 md:block md:w-16 lg:sticky lg:top-0 lg:h-[calc(100vh-65px)] lg:w-56">
          <NavigationLinks label="Main navigation" pathname={pathname} />
        </aside>
        <div className="min-w-0 flex-1 p-6">{children}</div>
      </div>
      {isMobileNavigationOpen ? (
        <div
          aria-label="Mobile navigation"
          aria-modal="true"
          className="fixed inset-0 z-40 bg-slate-950/30 md:hidden"
          onKeyDown={handleDrawerKeyDown}
          ref={drawerRef}
          role="dialog"
          tabIndex={-1}
        >
          <aside
            className="h-full w-72 bg-white p-4 shadow-xl"
            id="mobile-navigation"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold text-slate-900">RecruitLane</span>
              <button
                aria-label="Close navigation"
                className="rounded-md p-2 text-slate-700 hover:bg-slate-100"
                onClick={closeMobileNavigation}
                ref={drawerCloseButtonRef}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <NavigationLinks
              label="Mobile navigation"
              onNavigate={closeMobileNavigation}
              pathname={pathname}
            />
          </aside>
        </div>
      ) : null}
      {logoutMutation.isError ? (
        <Toast
          message="Unable to log out. Try again."
          onClose={() => logoutMutation.reset()}
          type="error"
        />
      ) : null}
    </>
  )
}

function NavigationLinks({
  label,
  onNavigate,
  pathname,
}: {
  label: string
  onNavigate?: () => void
  pathname: string
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {navigationItems.map(({ to, label: itemLabel }) => (
        <Link
          aria-current={pathname === to ? 'page' : undefined}
          aria-label={itemLabel}
          className={`rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100 ${
            pathname === to ? 'bg-slate-100 text-slate-900' : 'text-slate-700'
          } md:flex md:justify-center md:px-2 lg:block lg:px-3`}
          key={to}
          onClick={onNavigate}
          to={to}
        >
          <span aria-hidden="true" className="hidden md:inline lg:hidden">
            <NavigationIcon destination={to} />
          </span>
          <span className="md:hidden lg:inline">{itemLabel}</span>
        </Link>
      ))}
    </nav>
  )
}

function NavigationIcon({ destination }: { destination: (typeof navigationItems)[number]['to'] }) {
  if (destination === '/vacancies') {
    return (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeWidth="2" />
        <rect height="12" rx="2" strokeWidth="2" width="18" x="3" y="7" />
        <path d="M3 12h18M10 12h4" strokeWidth="2" />
      </svg>
    )
  }

  if (destination === '/candidates') {
    return (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3" strokeWidth="2" />
        <path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0-1.4-5.7M17 14.5a5 5 0 0 1 4 5.5" strokeWidth="2" />
      </svg>
    )
  }

  return (
    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="6" cy="6" r="2" strokeWidth="2" />
      <circle cx="18" cy="12" r="2" strokeWidth="2" />
      <circle cx="6" cy="18" r="2" strokeWidth="2" />
      <path d="m8 7 8 4M8 17l8-4" strokeWidth="2" />
    </svg>
  )
}
