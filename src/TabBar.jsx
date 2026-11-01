import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { StickyNote, CalendarDays, Wallet, PiggyBank, Store } from 'lucide-react'

// 앱 하단 탭: 앱 설치 여부·화면 폭과 상관없이 늘 보인다 (메모·일정·가계부·자산·앤딩 화면에서)
const SECTIONS = ['/notes', '/budget', '/assets', '/anding']
const LAST_BUDGET = 'dash.lastBudget'
const HEIGHT = 56
const ORDER_KEY = 'dash.tabOrder' // 꾹 눌러 바꾼 탭 순서 (이 기기)

export function useShowTabBar() {
  const { pathname } = useLocation()
  return SECTIONS.some(s => pathname.startsWith(s))
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

  // 꾹 눌러(0.5초) 좌우로 끌면 탭 순서 바꾸기
  const [order, setOrder] = useState(() => { try { return JSON.parse(localStorage.getItem(ORDER_KEY)) || [] } catch { return [] } })
  const [drag, setDrag] = useState(null) // { label, dx }
  const press = useRef(null), rowRef = useRef(null), fired = useRef(false)
  useEffect(() => () => clearTimeout(press.current?.timer), [])

  if (!show) return null
  const lastBudget = () => { try { return sessionStorage.getItem(LAST_BUDGET) || '/budget' } catch { return '/budget' } }
  const base = [
    { label: '메모', icon: StickyNote, to: '/notes', on: pathname === '/notes' },
    { label: '일정', icon: CalendarDays, to: '/notes/calendar', on: pathname.startsWith('/notes/calendar') },
    { label: '가계부', icon: Wallet, to: lastBudget, on: pathname.startsWith('/budget') },
    { label: '자산', icon: PiggyBank, to: '/assets', on: pathname.startsWith('/assets') },
    { label: '앤딩', icon: Store, to: '/anding', on: pathname.startsWith('/anding') },
  ]
  const rank = l => { const i = order.indexOf(l); return i < 0 ? 99 + base.findIndex(t => t.label === l) : i }
  const tabs = [...base].sort((x, y) => rank(x.label) - rank(y.label))

  const down = (label, e) => {
    fired.current = false
    const x0 = e.clientX
    press.current = { x0, y0: e.clientY, timer: setTimeout(() => {
      fired.current = true; navigator.vibrate?.(15)
      setDrag({ label, dx: 0, x0 })
    }, 450) }
  }
  const move = e => {
    const p = press.current
    if (!drag) { if (p && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) clearTimeout(p.timer); return }
    const w = rowRef.current.offsetWidth / tabs.length
    let dx = e.clientX - drag.x0
    const i = tabs.findIndex(t => t.label === drag.label)
    const step = Math.round(dx / w)
    if (step) {
      const j = Math.max(0, Math.min(tabs.length - 1, i + step))
      if (j !== i) {
        const labels = tabs.map(t => t.label); labels.splice(i, 1); labels.splice(j, 0, drag.label)
        setOrder(labels); dx -= (j - i) * w
        setDrag({ ...drag, dx, x0: e.clientX - dx }); return
      }
    }
    setDrag({ ...drag, dx })
  }
  const up = () => {
    clearTimeout(press.current?.timer); press.current = null
    if (drag) { try { localStorage.setItem(ORDER_KEY, JSON.stringify(tabs.map(t => t.label))) } catch {} setDrag(null) }
  }

  return (
    <nav aria-label="메뉴" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
      borderTop: '0.5px solid rgba(60,60,67,0.18)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div ref={rowRef} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        style={{ maxWidth: 680, margin: '0 auto', height: HEIGHT, display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, touchAction: 'none' }}>
        {tabs.map(({ label, icon: Icon, to, on }) => (
          <button key={label} aria-current={on ? 'page' : undefined}
            onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); down(label, e) }} onContextMenu={e => e.preventDefault()}
            onClick={() => { if (fired.current) { fired.current = false; return } navigate(typeof to === 'function' ? to() : to) }}
            style={{
              userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', position: 'relative',
              ...(drag?.label === label ? { transform: `translateX(${drag.dx}px) scale(1.08)`, zIndex: 1, opacity: 0.9 } : { transition: drag ? 'transform .15s' : 'none' }),
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              color: on ? '#1c1c1e' : '#a1a1a6', fontFamily: "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
              fontSize: 11, fontWeight: on ? 700 : 500,
            }}>
            {/* 선택된 탭은 아이콘 뒤에 옅은 알약 배경 */}
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 28, borderRadius: 999,
              background: on ? 'rgba(0,0,0,0.08)' : 'transparent', transition: 'background .2s' }}>
              <Icon size={21} strokeWidth={on ? 2.3 : 1.8} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}
