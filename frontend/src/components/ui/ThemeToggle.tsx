import { MoonStar, SunMedium } from 'lucide-react'
import { useUITheme } from './theme'

export function ThemeToggle() {
  const { theme, setTheme } = useUITheme()

  return (
    <div className="theme-toggle">
      <button
        type="button"
        onClick={() => setTheme('blue')}
        className={theme === 'blue' ? 'is-active' : ''}
        aria-pressed={theme === 'blue'}
      >
        <MoonStar size={14} />
        蓝色
      </button>
      <button
        type="button"
        onClick={() => setTheme('white')}
        className={theme === 'white' ? 'is-active' : ''}
        aria-pressed={theme === 'white'}
      >
        <SunMedium size={14} />
        白色
      </button>
    </div>
  )
}
