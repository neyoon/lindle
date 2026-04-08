import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { UIThemeProvider } from './components/ui/theme'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UIThemeProvider>
      <App />
    </UIThemeProvider>
  </React.StrictMode>,
)
