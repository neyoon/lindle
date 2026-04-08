import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type UITheme = 'blue' | 'white'

interface UIThemeContextValue {
  theme: UITheme
  setTheme: (theme: UITheme) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'miniflow-ui-theme'

const UIThemeContext = createContext<UIThemeContextValue | null>(null)

function readStoredTheme(): UITheme {
  if (typeof window === 'undefined') return 'blue'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  return saved === 'white' ? 'white' : 'blue'
}

export function UIThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<UITheme>(() => readStoredTheme())

  useEffect(() => {
    document.documentElement.dataset.uiTheme = theme
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const value = useMemo<UIThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => (current === 'blue' ? 'white' : 'blue')),
  }), [theme])

  return (
    <UIThemeContext.Provider value={value}>
      {children}
    </UIThemeContext.Provider>
  )
}

export function useUITheme() {
  const context = useContext(UIThemeContext)
  if (!context) {
    throw new Error('useUITheme must be used within UIThemeProvider')
  }
  return context
}
