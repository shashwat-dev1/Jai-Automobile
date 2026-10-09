import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import App from './App'

// Design system — import order matters
import './design-system/tokens.css'
import './design-system/reset.css'
import './design-system/typography.css'

// -------------------------------------------------------------------------
// TanStack Query client configuration
// -------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 401/403/404 — these are definitive responses
      retry: (failureCount, error: unknown) => {
        if (error instanceof Error && 'status' in error) {
          const status = (error as { status: number }).status
          if ([401, 403, 404].includes(status)) return false
        }
        return failureCount < 2
      },
      staleTime: 30_000,           // 30 seconds
      gcTime: 5 * 60 * 1000,       // 5 minutes garbage collection
      refetchOnWindowFocus: false,  // Don't auto-refetch on window focus (financial data)
    },
    mutations: {
      retry: false,
    },
  },
})

// -------------------------------------------------------------------------
// Application root
// -------------------------------------------------------------------------
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in DOM')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>,
)
