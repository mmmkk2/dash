import { useEffect, useRef, useState } from 'react'
import { ExternalLink, RotateCw } from 'lucide-react'

// 앤딩 스터디카페 관리자(별도 앱)를 내비서 안 한 화면으로 띄운다.
// 다른 주소를 그대로 끼워 넣으면 브라우저가 로그인 쿠키를 막기 때문에,
// vercel.json에서 /andingapp/* 를 앤딩 앱으로 중계해 같은 주소에서 연다.
const EMBED_URL = '/andingapp/admin'
export const ANDING_ADMIN_URL = 'https://andingapp.vercel.app/andingapp/admin'

// 메모·일정과 같은 톤의 테마를 앤딩 화면(같은 주소라 접근 가능)과 그 안의 상세 화면들에 덧입힌다
const THEME_HREF = '/anding-theme.css?v=11'
// 제목 앞 이모지(🪑📦💳📊 등)는 CSS로 못 지워서 글자에서 뺀다
// (요약 줄의 🟥·💻·👥 같은 상태 표시는 그대로 두고, 제목 바로 앞 이모지만)
const LEADING_EMOJI = /^\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u
const TRAILING_EMOJI = /\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*$/u
// 메모 목록 형식으로: 카드 제목은 카드 위 작은 회색 머리로 빼고, 카드 안 첫 줄 앞에 색 점
const SECTION_DOTS = ['#5b8fc9', '#4fa784', '#8f6bbf', '#3f9fae', '#d08a3a']
function memoStyleSections(doc) {
  doc.querySelectorAll('.box > .toggle-section').forEach((sec, i) => {
    if (sec.dataset.naebiseo) return
    sec.dataset.naebiseo = '1'
    const b = sec.querySelector('.summary-header > b')
    if (!b) return
    const label = doc.createElement('div')
    label.className = 'nb-label'
    label.textContent = b.textContent.trim()
    sec.before(label)
    const prev = b.previousSibling, next = b.nextSibling
    if (prev?.nodeType === 3 && !prev.nodeValue.trim()) prev.remove()
    if (next?.nodeName === 'BR') next.remove()
    b.remove()
    // 카드 안 첫 글자 앞에 색 점 (상태 이모지 줄이든 안쪽 요약 줄이든 첫 텍스트에)
    const walker = doc.createTreeWalker(sec.querySelector('.summary-header'), NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim() ? 1 : 3 })
    const first = walker.nextNode()
    if (first) {
      const dot = doc.createElement('span')
      dot.className = 'nb-dot'
      dot.style.background = SECTION_DOTS[i % SECTION_DOTS.length]
      first.parentNode.insertBefore(dot, first)
      first.parentNode.classList?.add('nb-first')
    }
  })
}

// 요약 줄의 상태 이모지(🟩💻👥⚠️⏰ 등)는 글자보다 커 보여서 작은 span으로 감싼다
const EMOJI_RUN = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}][\uFE0F\u200D\p{Extended_Pictographic}]*/gu
function shrinkEmojis(doc) {
  doc.querySelectorAll('.summary-header').forEach(h => {
    const walker = doc.createTreeWalker(h, NodeFilter.SHOW_TEXT)
    const nodes = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentNode.closest('.nb-emoji')) nodes.push(n)
    nodes.forEach(n => {
      const text = n.nodeValue
      EMOJI_RUN.lastIndex = 0
      if (!EMOJI_RUN.test(text)) return
      const frag = doc.createDocumentFragment()
      let last = 0
      text.replace(EMOJI_RUN, (m, at) => {
        if (at > last) frag.append(text.slice(last, at))
        const span = doc.createElement('span')
        span.className = 'nb-emoji'; span.textContent = m
        frag.append(span)
        last = at + m.length
      })
      if (last < text.length) frag.append(text.slice(last))
      n.replaceWith(frag)
    })
  })
}

// 스터디룸 표: 날짜는 위 날짜 이동에 있으니 '2026.10.27 11:30 ~ 2026.10.27 15:30' → '11:30 ~ 15:30',
// 2·4인실을 좌우로 놓고 카드 높이를 내용에 맞춘다
const DATE_PREFIX = /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\s*/g
function compactRoom(doc, frame) {
  if (!doc.querySelector('.tables .table-box')) return
  doc.documentElement.setAttribute('data-room', '')
  doc.querySelectorAll('.table-box td:first-child').forEach(td => {
    if (td.children.length === 0) td.textContent = td.textContent.replace(DATE_PREFIX, '').trim()
  })
  // 처음엔 접힌 칸 안에 숨어 있으니, 펼쳐져 크기가 바뀔 때마다 다시 맞춘다
  const win = doc.defaultView
  if (frame && win?.ResizeObserver) {
    // body는 iframe 높이만큼 늘어나므로, 보이는 내용의 맨 아래까지를 잰다
    const fit = () => {
      const h = Math.max(0, ...[...doc.body.children].map(el => el.getBoundingClientRect().bottom))
      if (h > 0) frame.style.height = `${Math.ceil(h + (win.scrollY || 0)) + 4}px`
    }
    new win.ResizeObserver(fit).observe(doc.body)
    fit()
  }
}

function tidyTitles(doc) {
  // 카드 제목(각 요약의 첫 굵은 글씨)만 — '⚠️ 만료완료' 같은 본문 굵은 글씨 앞 이모지는 남긴다
  doc.querySelectorAll('.toggle-section > .summary-header-row > .summary-header').forEach(h => {
    const b = h.querySelector(':scope > b')
    if (!b) return
    const n = b.previousSibling
    if (n?.nodeType === 3) n.nodeValue = n.nodeValue.replace(TRAILING_EMOJI, '')
  })
  doc.querySelectorAll('h1, h2').forEach(h => {
    const n = h.firstChild
    if (n?.nodeType === 3) n.nodeValue = n.nodeValue.replace(LEADING_EMOJI, '')
  })
}
function applyTheme(doc, nested, frame) {
  if (!doc?.head || doc.getElementById('naebiseo-theme')) return
  const link = doc.createElement('link')
  link.id = 'naebiseo-theme'; link.rel = 'stylesheet'; link.href = THEME_HREF
  doc.head.appendChild(link)
  if (nested) doc.documentElement.setAttribute('data-nested', '')
  tidyTitles(doc)
  if (nested) compactRoom(doc, frame)
  if (!nested) { memoStyleSections(doc); shrinkEmojis(doc) }
  const hook = f => {
    if (f.dataset.naebiseo) return
    f.dataset.naebiseo = '1'
    const go = () => { try { applyTheme(f.contentDocument, true, f) } catch {} }
    f.addEventListener('load', go)
    if (f.contentDocument?.readyState === 'complete') go()
  }
  doc.querySelectorAll('iframe').forEach(hook)
  // 나중에 생기는 상세 화면도
  new MutationObserver(() => doc.querySelectorAll('iframe').forEach(hook)).observe(doc.body || doc.documentElement, { childList: true, subtree: true })
}

export default function Anding() {
  const frame = useRef(null)
  const detach = useRef(() => {})
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [themed, setThemed] = useState(false) // 테마가 입혀지기 전 원래 모습이 번쩍이지 않게
  useEffect(() => () => detach.current(), [])

  const onFrameLoad = () => {
    try { applyTheme(frame.current?.contentDocument, false) } catch {}
    setThemed(true)
    bindRefresh()
  }

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
        gesture.distance = Math.min(140, dy * 0.65)
        setPull(gesture.distance)
      }
    }
    const end = () => {
      const ready = gesture?.distance >= 88
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'calc(var(--tabbar, 0px) + env(safe-area-inset-bottom))', background: '#f7f7f7', overflow: 'hidden' }}>
      <iframe ref={frame} onLoad={onFrameLoad} title="앤딩스터디카페 관리자" src={EMBED_URL} allow="clipboard-write"
        style={{ border: 0, width: '100%', height: '100%', display: 'block', opacity: themed ? 1 : 0, transition: 'opacity .15s' }} />
      <style>{`@keyframes anding-refresh-spin { to { transform: rotate(360deg); } }`}</style>
      {(pull > 10 || refreshing) && <div role="status" aria-label={refreshing ? '새로고침 중' : pull >= 88 ? '놓으면 새로고침' : '당겨서 새로고침'} style={{ position: 'absolute', top: `calc(${refreshing ? 36 : Math.max(0, pull - 28)}px + env(safe-area-inset-top))`, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.96)', color: '#4285f4', boxShadow: '0 2px 10px #00000014' }}>
        <RotateCw size={28} strokeWidth={2.5} style={refreshing ? { animation: 'anding-refresh-spin 0.8s linear infinite' } : { transform: `rotate(${pull * 3}deg)` }} />
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
