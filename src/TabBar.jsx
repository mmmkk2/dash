import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { StickyNote, CalendarDays, Wallet, PiggyBank, Store } from 'lucide-react'

// 앱 하단 탭: 휴대폰 폭이거나 설치한 앱으로 열었을 때만 보인다
const SECTIONS = ['/notes', '/budget', '/assets', '/infinite-buying']
const LAST_BUDGET = 'dash.lastBudget'
const HEIGHT = 56
// 앤딩 스터디카페 관리자(별도 앱) — 탭 한 번으로 바로 연다
const ANDING_ADMIN_URL = 'https://andingapp.vercel.app/andingapp/admin'

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone

export function useShowTabBar() {
  const { pathname } = useLocation()
  const [narrow, setNarrow] = useState(() => window.innerWidth < 700)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 700)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return (narrow || isStandalone()) && SECTIONS.some(s => pathname.startsWith(s))
}

export default function TabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const show = useShowTabBar()

  // 각 화면의 하단 여백·+버튼 위치가 탭 높이만큼 올라가도록 CSS 변수로 알려준다
  useEffect(() => {
    document.documentElement.style.setProperty('--tabbar', show ? `${HEIGHT}px` : '0px')
  }, [show])
  // 가계부 탭은 마지막으로 보던 장부로 돌아간다
  useEffect(() => {
    if (pathname.startsWith('/budget')) { try { sessionStorage.setItem(LAST_BUDGET, pathname) } catch {} }
  }, [pathname])

  if (!show) return null
  const lastBudget = () => { try { return sessionStorage.getItem(LAST_BUDGET) || '/budget' } catch { return '/budget' } }
  const tabs = [
    { label: '메모', icon: StickyNote, to: '/notes', on: pathname === '/notes' },
    { label: '일정', icon: CalendarDays, to: '/notes/calendar', on: pathname.startsWith('/notes/calendar') },
    { label: '가계부', icon: Wallet, to: lastBudget, on: pathname.startsWith('/budget') },
    { label: '자산', icon: PiggyBank, to: '/assets', on: pathname.startsWith('/assets') || pathname.startsWith('/infinite-buying') },
    { label: '앤딩', icon: Store, href: ANDING_ADMIN_URL },
  ]

  return (
    <nav aria-label="메뉴" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
      borderTop: '0.5px solid rgba(60,60,67,0.18)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', height: HEIGHT, display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(({ label, icon: Icon, to, on, href }) => (
          <button key={label} aria-current={on ? 'page' : undefined}
            onClick={() => href ? window.open(href, '_blank', 'noopener') : navigate(typeof to === 'function' ? to() : to)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              color: on ? '#1c1c1e' : '#8e8e93', fontFamily: "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
              fontSize: 11, fontWeight: on ? 700 : 500,
            }}>
            <Icon size={22} strokeWidth={on ? 2.2 : 1.8} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}
