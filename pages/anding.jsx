import { useEffect, useRef, useState } from 'react'
import { ExternalLink, RotateCw } from 'lucide-react'

// 앤딩 스터디카페 관리자(별도 앱)를 내비서 안 한 화면으로 띄운다.
// 다른 주소를 그대로 끼워 넣으면 브라우저가 로그인 쿠키를 막기 때문에,
// vercel.json에서 /andingapp/* 를 앤딩 앱으로 중계해 같은 주소에서 연다.
const EMBED_URL = '/andingapp/admin'
export const ANDING_ADMIN_URL = 'https://andingapp.vercel.app/andingapp/admin'

export default function Anding() {
  const frame = useRef(null)
  const detach = useRef(() => {})
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => () => detach.current(), [])

  const bindRefresh = () => {
    detach.current()
    setRefreshing(false)
    setPull(0)
    let doc
    try { doc = frame.current?.contentDocument; if (!doc) return } catch { return }
    let gesture = null
    const reset = () => { gesture = null; setPull(0) }
    const start = e => {
      reset()
      if (e.touches.length !== 1 || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
      // Nested scrolling panels must also be at their top before a pull can refresh.
      for (let node = e.target; node && node !== doc; node = node.parentElement) {
        if (node.scrollTop > 0) return
      }
      if ((doc.scrollingElement?.scrollTop || 0) > 0) return
      gesture = { x: e.touches[0].clientX, y: e.touches[0].clientY, distance: 0 }
    }
    const move = e => {
      if (!gesture) return
      if (e.touches.length !== 1) return reset()
      const dx = e.touches[0].clientX - gesture.x
      const dy = e.touches[0].clientY - gesture.y
      if (dy < 0 || Math.abs(dx) > 24 && Math.abs(dx) > dy) return reset()
      if (dy > 10) {
        if (!e.cancelable) return reset()
        e.preventDefault()
        gesture.distance = Math.min(90, dy * 0.5)
        setPull(gesture.distance)
      }
    }
    const end = () => {
      const ready = gesture?.distance >= 64
      reset()
      if (ready) {
        setRefreshing(true)
        // Reload only the embedded admin page; keep the outer app and its tabs intact.
        try { frame.current.contentWindow.location.reload() } catch { setRefreshing(false) }
      }
    }
    doc.addEventListener('touchstart', start, { passive: true })
    doc.addEventListener('touchmove', move, { passive: false })
    doc.addEventListener('touchend', end)
    doc.addEventListener('touchcancel', reset)
    detach.current = () => {
      doc.removeEventListener('touchstart', start)
      doc.removeEventListener('touchmove', move)
      doc.removeEventListener('touchend', end)
      doc.removeEventListener('touchcancel', reset)
    }
  }

  // 안쪽 화면을 끝까지 스크롤해도 바깥 페이지가 같이 밀려 하단 탭이 가려지지 않게 바깥 스크롤을 잠근다
  useEffect(() => {
    const html = document.documentElement, prev = [html.style.overflow, html.style.overscrollBehavior, document.body.style.overflow]
    html.style.overflow = 'hidden'; html.style.overscrollBehavior = 'none'; document.body.style.overflow = 'hidden'
    window.scrollTo(0, 0)
    return () => { [html.style.overflow, html.style.overscrollBehavior, document.body.style.overflow] = prev }
  }, [])

  return (
    // 화면 위 끝부터 하단 탭 바로 위까지 고정 (탭 높이 + 기기 하단 안전영역)
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'calc(var(--tabbar, 0px) + env(safe-area-inset-bottom))', background: '#f5f7f9' }}>
      <iframe ref={frame} onLoad={bindRefresh} title="앤딩스터디카페 관리자" src={EMBED_URL} allow="clipboard-write"
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
      <style>{`@keyframes anding-refresh-spin { to { transform: rotate(360deg); } }`}</style>
      {(pull > 10 || refreshing) && <div role="status" aria-label={refreshing ? '새로고침 중' : pull >= 64 ? '놓으면 새로고침' : '당겨서 새로고침'} style={{ position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.96)', color: pull >= 64 || refreshing ? '#333' : '#8e8e93', boxShadow: '0 2px 10px #00000014' }}>
        <RotateCw size={21} strokeWidth={2} style={refreshing ? { animation: 'anding-refresh-spin 0.8s linear infinite' } : { transform: `rotate(${pull * 3}deg)` }} />
      </div>}
      {/* 안에서 문제가 있을 때 따로 열기 */}
      <a href={ANDING_ADMIN_URL} target="_blank" rel="noopener noreferrer" aria-label="새 창으로 열기" style={{
        position: 'absolute', top: 'calc(10px + env(safe-area-inset-top))', right: 10, display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: 'none',
        color: '#1c1c1e', background: 'rgba(255,255,255,0.85)', border: '0.5px solid rgba(60,60,67,0.18)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', fontFamily: "-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
      }}>새 창 <ExternalLink size={12} /></a>
    </div>
  )
}
