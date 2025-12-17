import { useState, useEffect, useCallback } from 'react'

export type Route =
  | { page: 'home' }
  | { page: 'detail'; runId: string }
  | { page: 'not-found' }

export function parseRoute(pathname: string): Route {
  // Home
  if (pathname === '/' || pathname === '') {
    return { page: 'home' }
  }

  // Detail: /runs/:runId
  const runMatch = pathname.match(/^\/runs\/([^/]+)$/)
  if (runMatch) {
    return { page: 'detail', runId: runMatch[1] }
  }

  return { page: 'not-found' }
}

export function navigate(path: string): void {
  window.history.pushState({}, '', path)
  // Dispatch a custom event so useRoute can react
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return route
}

export function useNavigate(): (path: string) => void {
  return useCallback((path: string) => {
    navigate(path)
  }, [])
}

