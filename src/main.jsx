import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// 설치형 앱(PWA): 브라우저가 설치 가능하다고 알려주면 보관해 두고, 화면의 '앱 설치' 버튼에서 사용
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  window.__installPrompt = e
  window.dispatchEvent(new Event('installable'))
})
window.addEventListener('appinstalled', () => {
  window.__installPrompt = null
  window.dispatchEvent(new Event('installable'))
})

// 설치형 앱(PWA): 서비스 워커 등록 (배포 환경에서만)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
