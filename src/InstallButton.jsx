import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, X } from 'lucide-react'

// 앱 설치(PWA) 버튼 — 메모·일정 머리에 놓는 버튼과, 다른 화면 왼쪽 아래에 뜨는 버튼
// 이미 앱으로 열려 있으면 숨김. 브라우저가 설치를 허용하면 바로 설치 창, 아니면 메뉴로 설치하는 방법 안내
const C = { text: '#1c1c1e', sub: 'rgba(60,60,67,0.6)', sep: 'rgba(60,60,67,0.12)', card: '#fff', bg: '#f7f7f7', tint: '#1c1c1e' }
const F = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif"
const plain = { border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: F }
const DISMISS_KEY = 'dash.installDismissed'

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone

function useInstall() {
  const [canPrompt, setCanPrompt] = useState(() => !!window.__installPrompt)
  const [help, setHelp] = useState(false)
  useEffect(() => {
    const sync = () => setCanPrompt(!!window.__installPrompt)
    window.addEventListener('installable', sync)
    return () => window.removeEventListener('installable', sync)
  }, [])
  async function install() {
    const prompt = window.__installPrompt
    if (!prompt) return setHelp(true)
    prompt.prompt()
    await prompt.userChoice.catch(() => {})
    window.__installPrompt = null
    setCanPrompt(false)
  }
  return { canPrompt, help, setHelp, install }
}

function InstallHelp({ onClose }) {
  const step = { margin: '6px 0 0', fontSize: 15, lineHeight: 1.6, color: C.text }
  const group = (title, body) => (
    <section style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.sub, padding: '0 4px 8px' }}>{title}</div>
      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}`, padding: '12px 16px' }}>{body}</div>
    </section>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,20,16,0.6)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: F }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, width: '100%', maxWidth: 560, borderRadius: '22px 22px 0 0', padding: '20px 20px calc(28px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: C.text }}>앱으로 설치하기</div>
          <button aria-label="닫기" onClick={onClose} style={{ ...plain, color: C.sub, display: 'flex', padding: 4 }}><X size={22} /></button>
        </div>
        {group('크롬', <>
          <p style={{ ...step, marginTop: 0 }}>1. 오른쪽 위 <b>⋮</b> 메뉴를 열고 아래로 내려 <b>홈 화면에 추가</b> (또는 <b>앱 설치</b>)</p>
          <p style={step}>2. 창이 뜨면 <b>설치</b> 선택</p>
        </>)}
        {group('삼성 인터넷', <p style={{ ...step, marginTop: 0 }}>주소창의 <b>↓ 앱 설치</b> 아이콘, 없으면 <b>≡ → 현재 페이지 추가 → 홈 화면</b></p>)}
        <div style={{ fontSize: 13, color: C.sub }}>설치하면 홈 화면의 <b>내비서</b> 아이콘으로 바로 열려요.</div>
      </div>
    </div>
  )
}

// 메모·일정 머리에 놓는 버튼
export default function InstallButton() {
  const { canPrompt, help, setHelp, install } = useInstall()
  if (isStandalone()) return null
  return (
    <>
      <button onClick={install} style={{
        ...plain, display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, borderRadius: 999, padding: '6px 12px',
        color: canPrompt ? '#fff' : C.text, background: canPrompt ? C.tint : C.card, border: `0.5px solid ${canPrompt ? 'transparent' : C.sep}`,
      }}><Download size={14} />앱 설치</button>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  )
}

// 다른 화면(가계부·자산·앤딩 등): 왼쪽 아래 하단 탭 위에 작게. 메모·일정은 머리에 버튼이 있어 생략, ×로 닫으면 이번 접속 동안 숨김
export function InstallFloat() {
  const { pathname } = useLocation()
  const { canPrompt, help, setHelp, install } = useInstall()
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false } })
  if (isStandalone() || hidden || pathname.startsWith('/notes') || pathname === '/calculator') return null
  const dismiss = () => { setHidden(true); try { sessionStorage.setItem(DISMISS_KEY, '1') } catch {} }
  return (
    <>
      <div style={{
        position: 'fixed', left: 'max(16px, calc(50% - 314px))', bottom: 'calc(24px + var(--tabbar, 0px) + env(safe-area-inset-bottom))', zIndex: 30, // 떠 있는 + 버튼 위, 아래에서 올라오는 창(50)보다는 아래
        display: 'flex', alignItems: 'center', borderRadius: 999, fontFamily: F,
        background: canPrompt ? C.tint : 'rgba(255,255,255,0.95)', border: `0.5px solid ${canPrompt ? 'transparent' : C.sep}`,
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}>
        <button onClick={install} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, padding: '8px 4px 8px 12px', color: canPrompt ? '#fff' : C.text }}>
          <Download size={14} />앱 설치
        </button>
        <button aria-label="앱 설치 버튼 닫기" onClick={dismiss} style={{ ...plain, display: 'flex', padding: '8px 10px 8px 6px', color: canPrompt ? 'rgba(255,255,255,0.7)' : C.sub }}>
          <X size={14} />
        </button>
      </div>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  )
}
