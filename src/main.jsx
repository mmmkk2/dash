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

// 새 배포 자동 반영: 설치형 앱은 켜 둔 채로 계속 쓰면 예전 화면이 남아서,
// 앱으로 돌아올 때(또는 5분마다) 지금 배포의 화면 파일 이름을 확인하고 바뀌었으면 새로고침한다.
if (import.meta.env.PROD) {
  const mainScript = () => document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src')
  const current = mainScript()
  let checking = false
  const check = async () => {
    if (checking || document.hidden || !current) return
    checking = true
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text()
      const latest = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/)?.[1]
      // 글을 쓰는 중이면(입력칸에 커서) 다음 기회에
      const typing = document.activeElement?.matches?.('input, textarea, [contenteditable="true"]')
      if (latest && latest !== current && !typing) location.reload()
    } catch {} finally { checking = false }
  }
  document.addEventListener('visibilitychange', check)
  setInterval(check, 5 * 60 * 1000)
}
