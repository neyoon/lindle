export interface AppPreferences {
  defaultStopOnError: boolean
}

const STORAGE_KEY = 'lindle.app.preferences'

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultStopOnError: true,
}

export function getAppPreferences(): AppPreferences {
  if (typeof window === 'undefined') return DEFAULT_APP_PREFERENCES

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APP_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<AppPreferences>
    return {
      ...DEFAULT_APP_PREFERENCES,
      defaultStopOnError: parsed.defaultStopOnError ?? DEFAULT_APP_PREFERENCES.defaultStopOnError,
    }
  } catch {
    return DEFAULT_APP_PREFERENCES
  }
}

export function saveAppPreferences(preferences: AppPreferences): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
}
