import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { Tooltip } from 'radix-ui'
import '@fontsource-variable/inter/opsz.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.tsx'
import { Tuner } from './dev/Tuner.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={500} skipDelayDuration={300} disableHoverableContent>
        <App />
        {import.meta.env.DEV && <Tuner />}
      </Tooltip.Provider>
    </MotionConfig>
  </StrictMode>,
)
