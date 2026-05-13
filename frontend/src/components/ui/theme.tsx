import { createContext, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'

export type UITheme = 'paper'

interface UIThemeContextValue {
  theme: UITheme
  setTheme: (theme: UITheme) => void
  toggleTheme: () => void
}

const UIThemeContext = createContext<UIThemeContextValue | null>(null)

export function UIThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.uiTheme = 'paper'
  }, [])

  const value = useMemo<UIThemeContextValue>(() => ({
    theme: 'paper',
    setTheme: () => {},
    toggleTheme: () => {},
  }), [])

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
