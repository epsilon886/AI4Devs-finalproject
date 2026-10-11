import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import './index.css'
import { installSessionUnauthorizedHandler } from './features/auth/session.ts'
import { queryClient } from './lib/query-client.ts'
import { isAuthenticatedRoute, router } from './routes/router.tsx'

installSessionUnauthorizedHandler({
  queryClient,
  onSessionExpired: () => {
    if (isAuthenticatedRoute(router.state.location.pathname)) {
      void router.navigate({ to: '/login', replace: true })
    }
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
