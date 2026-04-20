/**
 * UI 主题
 *
 * Lindle 的视觉是单一的「Paper & Ink」纸墨风格，
 * 此处仅保留旧的 Provider/hook 形态以便组件继续 import，
 * 但不再切换主题 —— 始终是 paper。
 */
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
