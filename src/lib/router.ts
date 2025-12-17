import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'

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

// Simple event emitter for route changes
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): string {
  return window.location.pathname
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener())
}

export function navigate(path: string): void {
  window.history.pushState({}, '', path)
  notifyListeners()
}

// Handle browser back/forward
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notifyListeners)
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return parseRoute(pathname)
}

export function useNavigate(): (path: string) => void {
  return useCallback((path: string) => {
    navigate(path)
  }, [])
}
