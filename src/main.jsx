import './index.css'
import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App.jsx'
import { applyTextSize } from './textsize.js'

applyTextSize() // 저장된 글자 크기를 먼저 입혀서 화면이 한번 바뀌어 보이지 않게

window.__appStarted = true // index.html의 '불러오지 못함' 안내가 뜨지 않게

// 화면을 그리다 오류가 나면 흰 화면 대신 오류 내용과 다시 열기 버튼을 보여준다
class Crash extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error(error, info?.componentStack) }
  async reset() {
    // 오래된 화면 파일이 남아 생긴 문제일 수 있어 캐시·서비스 워커를 비우고 다시 연다
    try { for (const k of await caches.keys()) await caches.delete(k) } catch {}
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister() } catch {}
    location.reload()
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100dvh', background: '#f6f6f6', fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif", padding: '60px 20px', textAlign: 'center', color: '#1d1d1f' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>화면을 여는 중 오류가 났어요</div>
        <div style={{ fontSize: 13, color: '#86868b', margin: '12px auto 20px', maxWidth: 360, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message || this.state.error)}{'\n'}{location.pathname}</div>
        <button onClick={() => this.reset()} style={{ border: 'none', borderRadius: 999, padding: '12px 22px', fontSize: 15, fontWeight: 600, color: '#fff', background: '#3e9478' }}>다시 열기</button>
        <div><button onClick={() => { location.href = '/' }} style={{ border: 'none', background: 'none', marginTop: 14, fontSize: 14, color: '#3e9478' }}>처음 화면으로</button></div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Crash><App /></Crash>
  </StrictMode>
)

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
