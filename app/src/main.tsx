import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './theme/global.css'
import App from './App.tsx'
import { colorSchemeManager, theme } from './theme/theme'
import './i18n/config' // Initialize i18n

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} colorSchemeManager={colorSchemeManager} defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </StrictMode>,
)
