import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin, Search, ChevronLeft, ChevronRight, ChevronDown, Plus, Check, ListChecks, Heart, Droplet, ImagePlus, X, Trash2, CalendarDays, Maximize2, Minimize2, Pencil, Phone, Archive, ArchiveRestore, BookOpen, MapPin } from 'lucide-react'
import { supabase } from './pages/login'
import LectureNotes from './pages/lecture-notes'
import { useShowTabBar } from './src/TabBar'
import InstallButton from './src/InstallButton'

// 시스템 폰트 + 무채색 미니멀 라이트 톤 (색은 사용자가 고른 태그와 경고에만)
export const F = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Apple SD Gothic Neo','Noto Sans KR',sans-serif"
export const C = {
  bg: '#f7f7f7', card: '#fff', text: '#1c1c1e', sub: 'rgba(60,60,67,0.6)', faint: 'rgba(60,60,67,0.3)',
  sep: 'rgba(60,60,67,0.12)', fill: 'rgba(118,118,128,0.1)',
  tint: '#1c1c1e', tintSoft: 'rgba(0,0,0,0.06)', red: '#e5484d',
}
const COLORS = ['#1c1c1e', '#8e8e93', '#3b82c4', '#e8890c', '#e5484d', '#8b5cf6']
// 일정 색은 태그 색 (태그 없으면 회색)
const eventColor = e => TAGS[e.tag]?.color || '#a1a1a6'
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayStr = () => ymd(new Date())
// 예전 제목 필드가 있던 데이터는 본문 앞에 붙여서 한 덩어리로 다룬다
const joinText = (a, b) => [a, b].filter(Boolean).join('\n')

// 체크리스트 줄은 "- [ ] 할 일" / "- [x] 한 일" 형태로 본문에 저장
const CHECK_RE = /^- \[( |x)\] ?/
const parseLines = s => (s || '').split('\n').map(l => {
  const m = l.match(CHECK_RE)
  return m ? { check: true, done: m[1] === 'x', text: l.slice(m[0].length) } : { check: false, done: false, text: l }
})
const serializeLines = ls => ls.map(l => l.check ? `- [${l.done ? 'x' : ' '}] ${l.text}` : l.text).join('\n')
const plainText = s => parseLines(s).map(l => l.text).join('\n')
const daysUntil = s => Math.round((new Date(s) - new Date(todayStr())) / 86400000)

// ───────── 생리 주기 ─────────
const BODY = { period: '#e5484d', periodSoft: '#fdeaea', fertile: '#3b82c4', fertileSoft: '#edf3fa', love: '#d6336c', loveSoft: '#fdeaf2' }
const atMidnight = s => new Date(s + 'T00:00')
const addDays = (s, n) => { const d = atMidnight(s); d.setDate(d.getDate() + n); return ymd(d) }
const diffDays = (a, b) => Math.round((atMidnight(b) - atMidnight(a)) / 86400000)
const avg = (xs, fallback) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : fallback

// 기록된 생리(시작/끝)로 평균 주기·기간을 내고, 다음 생리와 가임기를 예측
function cycleInfo(periods, today) {
  const ps = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date))
  if (!ps.length) return null
  const gaps = ps.slice(1).map((p, i) => diffDays(ps[i].start_date, p.start_date)).filter(n => n >= 15 && n <= 60).slice(-6)
  const lens = ps.filter(p => p.end_date).map(p => diffDays(p.start_date, p.end_date) + 1).filter(n => n >= 1 && n <= 12).slice(-6)
  const cycle = avg(gaps, 28), len = avg(lens, 5)

  // 끝을 안 찍은 생리는 오늘까지(최대 10일)를 진행 중으로 본다
  const endOf = p => p.end_date || (today < p.start_date ? p.start_date : today <= addDays(p.start_date, 9) ? today : addDays(p.start_date, len - 1))
  const periodDays = new Set()
  for (const p of ps) for (let d = p.start_date, e = endOf(p); d <= e; d = addDays(d, 1)) periodDays.add(d)

  const last = ps[ps.length - 1]
  const predictedDays = new Set(), fertileDays = new Set(), ovulationDays = new Set()
  const markFertile = nextStart => {
    const ov = addDays(nextStart, -14)
    ovulationDays.add(ov)
    for (let i = -5; i <= 1; i++) fertileDays.add(addDays(ov, i))
  }
  // 지난 주기: 실제 다음 생리 시작일 기준 (비정상 간격은 건너뜀)
  ps.slice(1).forEach((p, i) => { const gap = diffDays(ps[i].start_date, p.start_date); if (gap >= 15 && gap <= 60) markFertile(p.start_date) })
  // 이번·앞으로의 주기: 평균 주기로 예측
  for (let k = 0; k <= 12; k++) {
    const start = addDays(last.start_date, k * cycle), next = addDays(start, cycle)
    if (k > 0) for (let i = 0; i < len; i++) { const d = addDays(start, i); if (!periodDays.has(d)) predictedDays.add(d) }
    markFertile(next)
  }
  const nextStart = addDays(last.start_date, cycle)
  const ongoing = !last.end_date && today >= last.start_date && today <= addDays(last.start_date, 9)
  return { ps, endOf, cycle, len, periodDays, predictedDays, fertileDays, ovulationDays, nextStart, ongoing, last }
}

function fmtDate(s) {
  const d = new Date(s)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`
}

// 메모 앱처럼: 오늘이면 시각, 일주일 안이면 요일, 그 외엔 날짜
function shortStamp(iso) {
  const d = new Date(iso), diff = daysUntil(ymd(d))
  if (diff === 0) return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  if (diff === -1) return '어제'
  if (diff > -7) return `${WEEK[d.getDay()]}요일`
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function dueLabel(due) {
  const n = daysUntil(due)
  if (n < 0) return [`${-n}일 지남`, C.red]
  if (n === 0) return ['오늘 마감', C.text]
  return [`D-${n}`, n <= 3 ? C.text : C.sub]
}

export const plain = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: F }
const field = { ...plain, cursor: 'text', outline: 'none', fontSize: 16, color: C.text, width: '100%' }

// ───────────────────────── 공통 컴포넌트 ─────────────────────────
function Group({ header, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      {header && <div style={{ fontSize: 15, fontWeight: 600, color: C.sub, padding: '0 4px 8px' }}>{header}</div>}
      <div style={{ background: C.card, borderRadius: 16, overflow: 'hidden', border: `0.5px solid ${C.sep}` }}>{children}</div>
    </section>
  )
}

// onLongPress: 꾹 누르면(0.5초, 손가락이 거의 안 움직일 때) 실행하고 그 뒤 클릭은 무시
function Row({ children, onClick, onLongPress, last, style }) {
  const timer = useRef(null), fired = useRef(false), start = useRef(null)
  const cancel = () => { clearTimeout(timer.current); start.current = null }
  const press = onLongPress && {
    onPointerDown: e => {
      fired.current = false; start.current = [e.clientX, e.clientY]
      timer.current = setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onLongPress() }, 500)
    },
    onPointerMove: e => { if (start.current && Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 8) cancel() },
    onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: e => e.preventDefault(), // 길게 누를 때 뜨는 브라우저 메뉴 막기
  }
  const click = e => { if (fired.current) { fired.current = false; return } onClick?.(e) }
  return (
    <div onClick={click} {...press} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, paddingLeft: 16, cursor: onClick ? 'pointer' : 'default', ...(onLongPress && { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }), ...style }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px 11px 0', borderBottom: last ? 'none' : `0.5px solid ${C.sep}`, alignSelf: 'stretch' }}>
        {children}
      </div>
    </div>
  )
}

// 전화번호 찾기: 010-1234-5678, 02-123-4567, 01012345678, +82 10-…, 1588-1234 등
const PHONE_RE = /(?<![\d+])(?:\+82[-\s]?|0)\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)|\b1[5-9]\d{2}-\d{4}\b/g
const findPhones = text => [...new Set(text.match(PHONE_RE) || [])]
const telHref = num => 'tel:' + num.replace(/[^\d+]/g, '')

// 글 속 전화번호는 바로 걸기, 주소(http·https·www.)는 새 창으로 열리는 링크로
const URL_RE = /(https?:\/\/|www\.)[^\s<>"']+/g
function Linkified({ text }) {
  const found = [
    ...[...text.matchAll(URL_RE)].map(m => { const url = m[0].replace(/[).,;:!?\]}'"]+$/, ''); return { i: m.index, s: url, href: url.startsWith('www.') ? `https://${url}` : url, url: true } }),
    ...[...text.matchAll(PHONE_RE)].map(m => ({ i: m.index, s: m[0], href: telHref(m[0]) })),
  ].sort((a, b) => a.i - b.i)
  const out = []
  let last = 0
  for (const f of found) {
    if (f.i < last) continue // 주소 안의 숫자는 전화번호로 보지 않음
    if (f.i > last) out.push(text.slice(last, f.i))
    out.push(<a key={f.i} href={f.href} {...(f.url && { target: '_blank', rel: 'noreferrer' })} onClick={e => e.stopPropagation()}
      style={{ color: f.url ? '#2f6fb3' : C.text, textDecoration: 'underline', textUnderlineOffset: 3, ...(f.url && { wordBreak: 'break-all' }) }}>{f.s}</a>)
    last = f.i + f.s.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// 일정 편집: 내용에 전화번호가 있으면 아래에 전화 버튼
function CallChips({ text }) {
  const phones = findPhones(text)
  if (!phones.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '-6px 0 16px' }}>
      {phones.map(n => (
        <a key={n} href={telHref(n)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: C.card,
          border: `0.5px solid ${C.sep}`, color: C.text, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
          <Phone size={15} /> {n}
        </a>
      ))}
    </div>
  )
}

// 내용만큼 늘어나는 입력칸 (너무 길면 maxHeight에서 멈추고 안에서 스크롤)
export function GrowTextarea({ value, minRows = 3, maxHeight = '50vh', style, inputRef, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return <textarea ref={el => { ref.current = el; if (inputRef) inputRef.current = el }} value={value} rows={minRows} {...props} style={{ ...style, maxHeight, overflowY: 'auto' }} />
}

// 폰 '뒤로 가기'로 열린 창부터 닫기: 창이 열리면 history에 한 칸 쌓고, 뒤로 가기가 오면 맨 위 창 하나만 닫는다
// (안 그러면 뒤로 가기가 이전 화면 — 예: 앤딩 — 으로 넘어가 버림)
const backStack = []
let skipPop = 0
window.addEventListener('popstate', () => {
  if (skipPop > 0) { skipPop--; return }
  const top = backStack.pop()
  if (top) { top.byBack = true; top.close() }
})
export function useBackClose(open, onClose) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!open) return
    const entry = { close: () => ref.current(), byBack: false }
    backStack.push(entry)
    window.history.pushState(window.history.state, '')
    return () => {
      const i = backStack.indexOf(entry)
      if (i >= 0) backStack.splice(i, 1)
      // 버튼 등으로 닫았으면 쌓았던 한 칸을 되돌린다 (이 되돌림은 다른 창을 닫지 않게 건너뜀)
      if (!entry.byBack) { skipPop++; window.history.back() }
    }
  }, [open])
}

export function Sheet({ title, onCancel, onDone, onBackdrop = onCancel, doneDisabled, actions, full, inset, doneLabel = '저장', hideCancel, tint = C.tint, height = 'min(78dvh, calc(100dvh - 80px))', titleLines = 1, children }) {
  // 뒤 배경은 가계부 창과 같게: 어둡게 + 살짝 흐리게
  return (
    <div onClick={onBackdrop} style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.6)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        // 크기는 가계부 창과 같게(최대 660px 가운데, 높이 최대 78%, 안쪽 좌우 20px), 폰에서는 양옆 12px 남김
        background: C.bg, width: 'calc(100% - 16px)', maxWidth: full ? 760 : 660, borderRadius: '24px 24px 0 0', overflowY: 'auto',
        // inset: 화면 가장자리에서 띄운 카드 모양 (좌우·아래 여백, 네 모서리 둥글게)
        ...(inset && { width: 'calc(100% - 16px)', maxWidth: 640, borderRadius: 22, marginBottom: 'calc(10px + env(safe-area-inset-bottom))' }),
        // 크게 보기도 화면 전체가 아니라 위가 조금 보이는 큰 창
        // full에 높이(예: '78dvh')를 주면 그 높이로
        // height: 내용 길이와 상관없이 모든 창이 같은 높이 (위를 남겨 바깥을 눌러 닫기 쉽게)
        // 크게 보기(full=true)는 화면 전체로 (위 여백 없이, 모서리 없이)
        ...(full === true ? { height: '100dvh', width: '100%', maxWidth: 'none', borderRadius: 0, boxSizing: 'border-box' } : { height: inset ? `calc(${full || height} - 10px - env(safe-area-inset-bottom))` : full || height }),
        paddingBottom: inset ? 16 : 'calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -10px 40px rgba(0,0,0,0.12)',
      }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: C.bg, display: 'flex', alignItems: 'center', gap: 8, padding: inset ? '18px 14px 12px' : full === true ? 'calc(14px + env(safe-area-inset-top)) 20px 12px' : '18px 20px 12px' }}>
          {/* 크게 보기는 바깥(배경)이 없어 눌러 닫을 곳이 없으니 왼쪽 X로 바로 닫기 (바깥 누름과 같은 동작: 편집 중이면 저장하고 닫음) */}
          {full === true && <button onClick={onBackdrop} aria-label="닫기" style={{ ...plain, display: 'flex', color: C.text, padding: 4, marginLeft: -6 }}><X size={22} /></button>}
          {/* titleLines=2: 긴 제목은 버튼 옆에서 두 줄까지 (노트) */}
          <div style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 700, overflow: 'hidden', ...(titleLines > 1
            ? { display: '-webkit-box', WebkitLineClamp: titleLines, WebkitBoxOrient: 'vertical', lineHeight: 1.3, letterSpacing: '-0.02em', wordBreak: 'keep-all' }
            : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }) }}>{title}</div>
          {actions}
          {!hideCancel && <button onClick={onCancel} style={{ ...plain, fontSize: 15, color: C.sub }}>취소</button>}
          <button onClick={onDone} disabled={doneDisabled} style={{
            ...plain, fontSize: 15, fontWeight: 600, color: '#fff', background: tint, borderRadius: 999, padding: '8px 18px',
            opacity: doneDisabled ? 0.35 : 1, cursor: doneDisabled ? 'default' : 'pointer',
          }}>{doneLabel}</button>
        </div>
        <div style={{ padding: inset ? '8px 16px 0' : '8px 20px 0' }}>{children}</div>
      </div>
    </div>
  )
}

// 편집 시트 아래의 작은 켜고 끄는 버튼 (마감일·고정 등)
function Chip({ on, icon: Icon, children, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={{
      ...plain, display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, borderRadius: 999, padding: '7px 10px', whiteSpace: 'nowrap',
      background: on ? C.tint : C.card, color: on ? '#fff' : C.text, border: `0.5px solid ${on ? 'transparent' : C.sep}`,
    }}><Icon size={15} />{children}</button>
  )
}

export function Fab({ label, onClick, color = C.tint }) {
  return (
    <button aria-label={label} onClick={onClick} style={{
      ...plain, position: 'fixed', zIndex: 20, right: 'max(20px, calc(50% - 320px))', bottom: 'calc(24px + var(--tabbar, 0px) + env(safe-area-inset-bottom))',
      width: 56, height: 56, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
    }}><Plus size={26} strokeWidth={2.2} /></button>
  )
}

// ───────────────────────── 메모 사진 ─────────────────────────
// 비공개 버킷에 '<user id>/<uuid>.jpg' 로 저장하고, 볼 때는 1시간짜리 서명 URL을 쓴다
const IMG_BUCKET = 'memo-images'

// 폰 사진은 커서 긴 변 1600px JPEG로 줄여서 올린다
async function shrinkImage(file, max = 1600) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.82))
  } finally { URL.revokeObjectURL(url) }
}

async function uploadMemoImage(file) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(IMG_BUCKET).upload(path, await shrinkImage(file), { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}
const removeImages = paths => { if (paths.length) supabase.storage.from(IMG_BUCKET).remove(paths) }

function PhotoViewer({ src, onClose, onDelete }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      <button aria-label="닫기" onClick={onClose} style={{ ...plain, position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', right: 14, color: '#fff', display: 'flex', padding: 8 }}><X size={26} /></button>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete() }} style={{
          ...plain, position: 'absolute', bottom: 'calc(24px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 15, background: 'rgba(255,255,255,0.14)', borderRadius: 999, padding: '10px 18px',
        }}><Trash2 size={17} />사진 삭제</button>
      )}
    </div>
  )
}

// ───────────────────────── 메모 ─────────────────────────
export function CheckCircle({ done, color = C.tint, onClick }) {
  return (
    <button type="button" aria-label={done ? '체크 해제' : '체크'} onClick={onClick} style={{
      ...plain, width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: done ? 'none' : `1.5px solid ${C.faint}`, background: done ? color : 'transparent',
    }}>{done && <Check size={14} color="#fff" strokeWidth={3} />}</button>
  )
}

const toolBtn = { ...plain, display: 'flex', alignItems: 'center', gap: 6, color: C.sub, fontSize: 14, fontWeight: 500, padding: '6px 8px', borderRadius: 8 }

// 줄 단위 편집기: 일반 줄과 체크리스트 줄을 섞어 쓴다 (엔터 = 같은 종류의 새 줄)
function NoteEditor({ value, onChange, autoFocus, attachments, tools, full, readOnly }) {
  const lines = parseLines(value)
  const refs = useRef([])
  const cur = useRef(lines.length - 1)
  const [focus, setFocus] = useState(autoFocus ? { i: lines.length - 1, pos: Infinity } : null)

  const boxRef = useRef(null)
  useLayoutEffect(() => {
    // 줄 높이를 다시 재는 동안 스크롤이 튀지 않게 위치를 지키고, 입력 중인 줄이 보이게 맞춘다
    const box = boxRef.current, top = box?.scrollTop
    refs.current.slice(0, lines.length).forEach(el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } })
    if (!box) return
    box.scrollTop = top
    const act = document.activeElement
    if (act && box.contains(act)) {
      const b = box.getBoundingClientRect(), r = act.getBoundingClientRect()
      if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8
      else if (r.top < b.top) box.scrollTop -= b.top - r.top + 8
    }
  })
  useEffect(() => {
    const el = focus && refs.current[focus.i]
    if (!el) return
    el.focus()
    const p = Math.min(focus.pos, el.value.length)
    el.setSelectionRange(p, p)
    el.scrollIntoView({ block: 'nearest' })
  }, [focus])

  const update = (next, f) => { onChange(serializeLines(next)); if (f) setFocus(f) }

  function changeLine(i, v) {
    const l = lines[i], next = [...lines]
    if (!v.includes('\n')) { next[i] = { ...l, text: v }; return update(next) }
    // 빈 체크 줄에서 엔터 → 체크리스트 끝내고 일반 줄로
    if (l.check && !l.text && v === '\n') { next[i] = { check: false, done: false, text: '' }; return update(next, { i, pos: 0 }) }
    const parts = v.split('\n')
    const added = parts.map((t, k) => k === 0 ? { ...l, text: t } : { check: l.check, done: false, text: t })
    next.splice(i, 1, ...added)
    update(next, { i: i + parts.length - 1, pos: 0 })
  }

  function keyDown(i, e) {
    const el = e.target
    if (e.key !== 'Backspace' || e.nativeEvent.isComposing || el.selectionStart !== 0 || el.selectionEnd !== 0) return
    const next = [...lines]
    if (lines[i].check) {
      e.preventDefault(); next[i] = { ...lines[i], check: false, done: false }; update(next, { i, pos: 0 })
    } else if (i > 0) {
      e.preventDefault()
      const prev = lines[i - 1]
      next.splice(i - 1, 2, { ...prev, text: prev.text + lines[i].text })
      update(next, { i: i - 1, pos: prev.text.length })
    }
  }

  function toggleChecklist() {
    const i = Math.min(cur.current, lines.length - 1), next = [...lines]
    next[i] = { ...lines[i], check: !lines[i].check, done: false }
    update(next, { i, pos: Infinity })
  }
  function toggleDone(i) {
    const next = [...lines]
    next[i] = { ...lines[i], done: !lines[i].done }
    update(next)
  }

  return (
    <>
      <div ref={boxRef} onClick={e => { if (!readOnly && e.target === e.currentTarget) setFocus({ i: lines.length - 1, pos: Infinity }) }}
        style={{ padding: '12px 16px', overflowY: 'auto', overscrollBehavior: 'contain', cursor: readOnly ? 'default' : 'text',
          // 크게 보기면 화면 대부분을, 평소엔 읽기·편집 모두 화면의 45% (내용 길이와 상관없이 같은 크기)
          ...(full ? { height: `calc(100dvh - ${readOnly ? 200 : 255}px - env(safe-area-inset-bottom) - env(safe-area-inset-top))`, minHeight: 200 }
            : { height: '45dvh', minHeight: 180 }) }}>
        {/* 읽기 보기: 키보드 없이 큰 글씨로, 체크 항목은 바로 체크 가능 */}
        {readOnly && lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: l.check ? '4px 0' : 0, minHeight: l.text ? 0 : '0.9em' }}>
            {l.check && <span style={{ paddingTop: 4 }}><CheckCircle done={l.done} onClick={() => toggleDone(i)} /></span>}
            <div style={{ flex: 1, fontSize: 17, lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: l.done ? C.sub : C.text, textDecoration: l.done ? 'line-through' : 'none' }}><Linkified text={l.text} /></div>
          </div>
        ))}
        {!readOnly && lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: l.check ? '3px 0' : 0 }}>
            {l.check && <span style={{ paddingTop: 2 }}><CheckCircle done={l.done} onClick={() => toggleDone(i)} /></span>}
            <textarea ref={el => { refs.current[i] = el }} rows={1} value={l.text}
              placeholder={lines.length === 1 && !l.check ? '메모' : ''}
              onFocus={() => { cur.current = i }} onChange={e => changeLine(i, e.target.value)} onKeyDown={e => keyDown(i, e)}
              style={{ ...field, display: 'block', flex: 1, padding: 0, resize: 'none', overflow: 'hidden', lineHeight: 1.6,
                color: l.done ? C.sub : C.text, textDecoration: l.done ? 'line-through' : 'none' }} />
          </div>
        ))}
      </div>
      {attachments}
      {!readOnly && (
        <div style={{ borderTop: `0.5px solid ${C.sep}`, padding: '8px 12px', display: 'flex', gap: 4 }}>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={toggleChecklist} style={toolBtn}><ListChecks size={18} />체크리스트</button>
          {tools}
        </div>
      )}
    </>
  )
}

// 메모 편집 상태 비교용 (내용·마감일·색·고정·사진)
const memoSnapshot = e => JSON.stringify([e.content, e.due_date || '', e.color, !!e.pinned, e.images || [], e.tag || ''])

// 메모 태그 — 목록에서 쉽게 구분되는 색과 연한 배경
export const TAGS = {
  personal: { label: '개인', color: '#b5814e', soft: '#fcf8f2' },
  cafe: { label: '앤딩', color: '#3e9478', soft: '#f2faf6' },
  realty: { label: '부동산', color: '#4d83ba', soft: '#f3f8fd' },
  goion: { label: '고이온', color: '#9867b7', soft: '#faf5fd' },
}

// 태그가 없거나 '전체'일 때의 탭 색 — 메모·일정 모두 코랄 (노랑은 개인 갈색과 구분이 안 돼서)
export const MEMO_TINT = '#ef6a5f'
const CAL_TINT = '#ef6a5f'

function TagChip({ tag, on, onClick, small, allColor = C.tint }) {
  const t = TAGS[tag]
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={{
      ...plain, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', borderRadius: 999,
      fontSize: small ? 12 : 13, fontWeight: 600, padding: small ? '5px 10px' : '7px 11px',
      // 선택하면 태그 색으로 채우고 흰 글씨 (가계부 사업 칩과 같은 방식)
      background: on ? (t ? t.color : allColor) : C.card, color: on ? '#fff' : (t?.color || C.text), border: `0.5px solid ${on && t ? t.color : C.sep}`,
    }}>
      {t && <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#fff' : t.color }} />}
      {t ? t.label : '전체'}
    </button>
  )
}

function MemoTab({ memos, reload, setErr, onMovedToNote }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [full, setFull] = useState(false) // 편집 창 크게 보기
  // 폰 뒤로 가기: 사진 → 크게 보기 → 메모 창 순서로 하나씩 닫기 (메모 창은 바깥 누름과 같이 저장하며 닫음)
  useBackClose(!!edit, () => save())
  useBackClose(!!edit && full, () => setFull(false))
  useBackClose(!!edit && !!viewer, () => setViewer(null))
  const [editing, setEditing] = useState(false) // 기존 메모는 읽기 보기로 열고, 편집 버튼을 눌러야 키보드
  const [uploading, setUploading] = useState(0)
  const fileRef = useRef(null)

  // 화면에 필요한 사진의 서명 URL을 모아서 한 번에 받아온다 (목록은 첫 장만)
  const [urls, setUrls] = useState({})
  const requested = useRef(new Set())
  useEffect(() => {
    const need = [...memos.flatMap(m => (m.images || []).slice(0, 1)), ...(edit?.images || [])].filter(p => !requested.current.has(p))
    if (!need.length) return
    need.forEach(p => requested.current.add(p))
    supabase.storage.from(IMG_BUCKET).createSignedUrls(need, 3600).then(({ data }) => {
      if (data) setUrls(u => ({ ...u, ...Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])) }))
    })
  }, [memos, edit?.images])

  async function addPhotos(files) {
    for (const file of files) {
      setUploading(n => n + 1)
      try {
        const path = await uploadMemoImage(file)
        setEdit(ed => ed && { ...ed, images: [...(ed.images || []), path], uploaded: [...ed.uploaded, path] })
      } catch (e) {
        setErr(e.message)
      } finally {
        setUploading(n => n - 1)
      }
    }
  }
  // 저장 안 하고 닫으면 이번에 올린 사진은 지운다
  const discard = () => { removeImages(edit.uploaded); setEdit(null) }

  const [tagFilter, setTagFilter] = useState('')
  const hasTags = memos.some(m => TAGS[m.tag])
  const lastTap = useRef(0) // 읽기 보기 두 번 누름 감지
  const [showArchived, setShowArchived] = useState(false)
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return memos
      .filter(m => !tagFilter || m.tag === tagFilter)
      // 보관한 메모는 목록에서 빼고 아래 보관함에만 — 검색할 때는 같이 찾는다
      .filter(m => k || !m.archived)
      .filter(m => !k || (m.title + ' ' + plainText(m.content) + ' ' + (TAGS[m.tag]?.label || '')).toLowerCase().includes(k))
      // 급한 순서: 마감일 있는 메모(지난 것 → 가까운 날짜) 먼저, 나머지는 최근 수정 순
      .sort((a, b) => a.due_date && b.due_date ? a.due_date.localeCompare(b.due_date) || b.updated_at.localeCompare(a.updated_at)
        : a.due_date ? -1 : b.due_date ? 1 : b.updated_at.localeCompare(a.updated_at))
  }, [memos, q, tagFilter])
  const pinned = list.filter(m => m.pinned), others = list.filter(m => !m.pinned)
  const archived = useMemo(() => memos.filter(m => m.archived && (!tagFilter || m.tag === tagFilter))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [memos, tagFilter])

  // 저장 버튼과 바깥 탭이 겹쳐도 한 번만 저장 (새 메모가 두 개 생기던 문제)
  const saving = useRef(false)
  async function save() {
    if (uploading || saving.current) return
    saving.current = true
    try { await doSave() } finally { saving.current = false }
  }
  async function doSave() {
    // 열어보기만 하고 바뀐 게 없으면 저장하지 않는다 (수정 시각·목록 순서 유지)
    if (edit.id && memoSnapshot(edit) === edit.snapshot) return setEdit(null)
    const row = { title: '', content: edit.content, due_date: edit.due_date || null, color: edit.color, pinned: edit.pinned, updated_at: new Date().toISOString() }
    // images 컬럼이 아직 없는 DB에서도 사진을 안 쓰면 그대로 저장되도록 있을 때만 보낸다
    if (edit.images !== undefined) row.images = edit.images
    if (edit.tag !== undefined) row.tag = edit.tag || null
    if (!row.content.trim() && !edit.images?.length) return discard()
    const { error } = edit.id
      ? await supabase.from('memos').update(row).eq('id', edit.id)
      : await supabase.from('memos').insert(row)
    if (error) return setErr(error.message)
    removeImages((edit.origImages || []).filter(p => !edit.images.includes(p)))
    setEdit(null); reload()
  }
  async function remove() {
    if (!confirm('이 메모를 삭제할까요?')) return
    const { error } = await supabase.from('memos').delete().eq('id', edit.id)
    if (error) return setErr(error.message)
    removeImages([...new Set([...(edit.origImages || []), ...(edit.images || [])])])
    setEdit(null); reload()
  }

  // 메모 → 노트: 첫 줄은 제목, 나머지는 본문(체크 줄은 노트 체크리스트 그대로), 사진은 노트 첨부로(메모 버킷에 그대로 둠), 태그는 과목으로
  async function toNote() {
    if (!confirm('이 메모를 노트로 옮길까요?')) return
    const lines = (edit.content || '').split('\n')
    const first = lines.findIndex(l => l.trim())
    const title = first >= 0 ? lines[first].replace(CHECK_RE, '').replace(/^- /, '').trim().slice(0, 80) : ''
    const content = first >= 0 ? lines.slice(first + 1).join('\n').replace(/^\n+/, '') : ''
    const files = (edit.images || []).map((p, i) => ({ path: p, name: `사진 ${i + 1}.jpg`, size: 0, type: 'image/jpeg', bucket: IMG_BUCKET }))
    const { error } = await supabase.from('lecture_notes').insert({ title, subject: TAGS[edit.tag]?.label || null, content, files, updated_at: new Date().toISOString() })
    if (error) return setErr(error.message)
    await supabase.from('memos').delete().eq('id', edit.id)
    // 편집 중에 뺀 사진만 지운다 (남은 사진은 노트가 씀)
    removeImages((edit.origImages || []).filter(p => !(edit.images || []).includes(p)))
    setEdit(null); reload(); onMovedToNote?.()
  }

  // 목록에서 꾹 누르면 고정/해제 (내용·수정 시각은 그대로)
  async function togglePin(m) {
    const { error } = await supabase.from('memos').update({ pinned: !m.pinned }).eq('id', m.id)
    if (error) return setErr(error.message)
    reload()
  }

  // 보관/꺼내기: 내용·수정 시각은 그대로 두고 archived만 바꾼다
  async function setArchived(id, on) {
    const { error } = await supabase.from('memos').update({ archived: on }).eq('id', id)
    if (error) return setErr(/archived/.test(error.message) ? 'Supabase SQL 편집기에서 먼저 실행해 주세요: alter table memos add column if not exists archived boolean default false;' : error.message)
    reload()
  }
  async function archiveOpen() {
    const on = !edit.archived
    // 열어둔 채 고친 내용이 있으면 먼저 저장
    if (memoSnapshot(edit) !== edit.snapshot) await save(); else setEdit(null)
    setArchived(edit.id, on)
  }

  const open = m => {
    const ed = { ...m, content: joinText(m.title, m.content), origImages: m.images, uploaded: [] }
    setEdit({ ...ed, snapshot: memoSnapshot(ed) })
    setEditing(false)
  }
  const renderRows = arr => arr.map((m, i) => {
    const all = parseLines(joinText(m.title, m.content))
    const [first, ...rest] = all.map(l => l.text).filter(t => t.trim())
    const preview = rest.join(' ').trim()
    const checks = all.filter(l => l.check && l.text.trim()), doneN = checks.filter(l => l.done).length
    const due = m.due_date && dueLabel(m.due_date)
    // 다 끝난 메모(체크 모두 완료 또는 마감 지남)는 보관을 권한다 — 자동으로 숨기진 않음
    const done = !m.archived && ((checks.length > 0 && doneN === checks.length) || (m.due_date && m.due_date < todayStr()))
    return (
      <Row key={m.id} onClick={() => open(m)} onLongPress={() => togglePin(m)} last={i === arr.length - 1}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {TAGS[m.tag] && <span style={{ width: 8, height: 8, borderRadius: '50%', background: TAGS[m.tag].color, flexShrink: 0 }} />}
            <div style={{ fontSize: 16, fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{first || (m.images?.length ? '사진 메모' : '빈 메모')}</div>
          </div>
          <div style={{ fontSize: 14, color: C.sub, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {TAGS[m.tag] && <span style={{ color: TAGS[m.tag].color, background: TAGS[m.tag].color + '1c', fontWeight: 600, fontSize: 12, borderRadius: 6, padding: '1px 6px', marginRight: 8 }}>{TAGS[m.tag].label}</span>}
            {m.archived && q.trim() && <span style={{ color: C.sub, background: C.fill, fontWeight: 600, fontSize: 12, borderRadius: 6, padding: '1px 6px', marginRight: 8 }}>보관됨</span>}
            {due && !m.archived && <span style={{ color: due[1], fontWeight: 600, marginRight: 8 }}>{due[0]}</span>}
            {checks.length > 0 && <span style={{ color: C.sub, fontWeight: 600, marginRight: 8 }}>✓ {doneN}/{checks.length}</span>}
            {preview || shortStamp(m.updated_at)}
          </div>
        </div>
        {done ? (
          <button aria-label="완료 · 보관" onClick={e => { e.stopPropagation(); setArchived(m.id, true) }} style={{
            ...plain, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 12, fontWeight: 600, color: C.sub,
            background: C.fill, borderRadius: 999, padding: '5px 9px',
          }}><Archive size={13} />보관</button>
        ) : (
          <div style={{ fontSize: 14, color: C.sub, whiteSpace: 'nowrap', textAlign: 'right' }}>
            {preview && shortStamp(m.updated_at)}
          </div>
        )}
        {m.images?.length > 0 && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: C.fill, backgroundImage: urls[m.images[0]] ? `url("${urls[m.images[0]]}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
            {m.images.length > 1 && <span style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 10, fontWeight: 700, color: '#fff', background: C.tint, borderRadius: 999, padding: '1px 5px' }}>{m.images.length}</span>}
          </div>
        )}
      </Row>
    )
  })

  return (
    <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, borderRadius: 12, padding: '10px 12px', marginBottom: hasTags ? 10 : 22, border: `0.5px solid ${C.sep}` }}>
        <Search size={16} color={C.sub} strokeWidth={2.2} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`메모 ${memos.length}개에서 검색`} style={field} />
      </label>
      {/* 태그가 붙은 메모가 있을 때만 사업자별 필터 */}
      {hasTags && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 18, paddingBottom: 2 }}>
          <TagChip small allColor={MEMO_TINT} on={!tagFilter} onClick={() => setTagFilter('')} />
          {Object.keys(TAGS).map(k => <TagChip key={k} tag={k} small on={tagFilter === k} onClick={() => setTagFilter(tagFilter === k ? '' : k)} />)}
        </div>
      )}

      {list.length === 0 && <div style={{ textAlign: 'center', color: C.sub, padding: '60px 0', fontSize: 15 }}>{q || tagFilter ? '찾는 메모가 없어요' : archived.length ? '모두 보관했어요' : '+ 버튼으로 첫 메모를 남겨보세요'}</div>}
      {pinned.length > 0 && <Group header={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Pin size={12} />고정됨</span>}>{renderRows(pinned)}</Group>}
      {others.length > 0 && <Group header={pinned.length > 0 ? '메모' : null}>{renderRows(others)}</Group>}
      {!q.trim() && archived.length > 0 && (
        <>
          <button onClick={() => setShowArchived(v => !v)} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: C.sub, padding: '4px 4px 8px' }}>
            <Archive size={15} />보관함 {archived.length}
            <ChevronDown size={16} style={{ transform: showArchived ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
          </button>
          {showArchived && <Group>{renderRows(archived)}</Group>}
        </>
      )}

      <Fab label="새 메모" color={TAGS[tagFilter]?.color || MEMO_TINT} onClick={() => setEditing(true) || setEdit({ content: '', color: COLORS[0], pinned: false, uploaded: [], ...(tagFilter ? { tag: tagFilter } : {}) })} />

      {edit && (
        <Sheet title={!edit.id ? '새 메모' : editing ? '메모 편집' : '메모'} tint={TAGS[edit.tag]?.color || MEMO_TINT} doneLabel={editing ? '저장' : '닫기'} hideCancel={!editing} onCancel={discard} onDone={save} onBackdrop={save} doneDisabled={uploading > 0}
          full={full}
          actions={<>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: C.text, padding: '6px 10px', borderRadius: 999, background: C.card, border: `0.5px solid ${C.sep}` }}>
                <Pencil size={14} />편집
              </button>
            )}
            <button aria-label={full ? '작게 보기' : '크게 보기'} onClick={() => setFull(f => !f)} style={{ ...plain, display: 'flex', color: C.sub, padding: 4 }}>
              {full ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
            </button>
            {edit.id && <button aria-label={edit.archived ? '보관 해제' : '메모 보관'} onClick={archiveOpen} style={{ ...plain, display: 'flex', color: C.sub, padding: 4 }}>
              {edit.archived ? <ArchiveRestore size={19} /> : <Archive size={19} />}
            </button>}
            {edit.id && !editing && <button aria-label="노트로 옮기기" title="노트로 옮기기" onClick={toNote} style={{ ...plain, display: 'flex', color: C.sub, padding: 4 }}><BookOpen size={19} /></button>}
            {edit.id && <button aria-label="메모 삭제" onClick={remove} style={{ ...plain, display: 'flex', color: C.sub, padding: 4 }}><Trash2 size={19} /></button>}
          </>}>
          {/* 읽기 보기에서 내용을 두 번 누르면 바로 편집 (체크·링크·사진 누름은 제외) */}
          <div onClick={e => {
            if (editing || e.target.closest('button, a, input')) return
            const now = Date.now()
            if (now - lastTap.current < 350) { lastTap.current = 0; setEditing(true) } else lastTap.current = now
          }}>
          <Group>
            <NoteEditor key={editing ? 'edit' : 'read'} value={edit.content} onChange={content => setEdit(ed => ({ ...ed, content }))}
              autoFocus={editing} readOnly={!editing} full={full}
              attachments={(edit.images?.length > 0 || uploading > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '0 16px 12px' }}>
                  {(edit.images || []).map(p => (
                    <button key={p} type="button" aria-label="사진 보기" onClick={() => setViewer(p)} style={{
                      ...plain, aspectRatio: '1', borderRadius: 10, background: C.fill,
                      backgroundImage: urls[p] ? `url("${urls[p]}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center',
                    }} />
                  ))}
                  {Array.from({ length: uploading }, (_, i) => (
                    <div key={'up' + i} style={{ aspectRatio: '1', borderRadius: 10, background: C.fill, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.sub }}>올리는 중…</div>
                  ))}
                </div>
              )}
              tools={<>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => fileRef.current?.click()} style={toolBtn}><ImagePlus size={18} />사진</button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addPhotos([...e.target.files]); e.target.value = '' }} />
              </>} />
          </Group>
          </div>
          {/* 마감일·고정 / 사업자 태그 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '-10px 0 8px' }}>
            <Chip on={!!edit.due_date} icon={CalendarDays} onClick={() => setEdit({ ...edit, due_date: edit.due_date ? '' : todayStr() })}>마감일</Chip>
            {edit.due_date && (
              <input type="date" aria-label="마감 날짜" value={edit.due_date} onChange={e => setEdit({ ...edit, due_date: e.target.value })}
                style={{ ...field, width: 'auto', fontSize: 14, background: C.card, border: `0.5px solid ${C.sep}`, borderRadius: 999, padding: '6px 12px' }} />
            )}
            <Chip on={!!edit.pinned} icon={Pin} onClick={() => setEdit({ ...edit, pinned: !edit.pinned })}>고정</Chip>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {Object.keys(TAGS).map(k => <TagChip key={k} tag={k} on={edit.tag === k} onClick={() => setEdit({ ...edit, tag: edit.tag === k ? '' : k })} />)}
          </div>
          {viewer && (
            <PhotoViewer src={urls[viewer]} onClose={() => setViewer(null)}
              onDelete={() => { setEdit(ed => ({ ...ed, images: ed.images.filter(x => x !== viewer) })); setViewer(null) }} />
          )}
        </Sheet>
      )}
    </>
  )
}

// ───────────────────────── 일정 ─────────────────────────
function CalendarTab({ events, reload, setErr, body, reloadBody }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(todayStr())
  const [edit, setEdit] = useState(null)
  useBackClose(!!edit, () => setEdit(null)) // 폰 뒤로 가기로 일정 창 닫기
  const [pickTime, setPickTime] = useState(null) // 일정 창에서 칩을 펼친 시간: 'start' | 'end' | null
  useEffect(() => { if (!edit) setPickTime(null) }, [edit])
  // 사업자 태그 필터 (메모와 같은 태그) — 태그 붙은 일정이 있을 때만 보임
  const [tagFilter, setTagFilter] = useState('')
  const hasTags = events.some(e => TAGS[e.tag])
  const shown = useMemo(() => tagFilter ? events.filter(e => e.tag === tagFilter) : events, [events, tagFilter])

  const byDate = useMemo(() => {
    const m = {}
    for (const e of shown) (m[e.date] ||= []).push(e)
    for (const k in m) m[k].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
    return m
  }, [shown])

  const cells = useMemo(() => {
    const start = new Date(month); start.setDate(1 - month.getDay())
    const weeks = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7)
    return Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])

  // 다가오는 일정을 단계별로: 3일 안 / 이번 주 / 다음 주 / 그 이후(5개까지)
  const upcoming = useMemo(() => {
    const t = todayStr(), now = new Date(t + 'T00:00:00')
    const days = e => Math.round((new Date(e.date + 'T00:00:00') - now) / 864e5)
    const weekEnd = 6 - now.getDay() // 이번 주 토요일까지 남은 날 (달력처럼 일요일 시작)
    const list = shown.filter(e => e.date > t && !e.done).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')))
    const groups = [['3일 안', []], ['이번 주', []], ['다음 주', []], ['그 이후', []]]
    for (const e of list) {
      const d = days(e)
      groups[d <= 3 ? 0 : d <= weekEnd ? 1 : d <= weekEnd + 7 ? 2 : 3][1].push(e)
    }
    groups[3][1] = groups[3][1].slice(0, 5)
    return groups.filter(([, es]) => es.length)
  }, [shown])

  const moveMonth = n => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1))

  // 연도를 누르면 12년 단위 연도 선택 (null이면 닫힘, 숫자는 표시 중인 첫 해)
  const [yearPage, setYearPage] = useState(null)
  const pickYear = y => { setMonth(m => new Date(y, m.getMonth(), 1)); setYearPage(null) }

  // 달력을 좌우로 밀면 이전/다음 달 (세로 스크롤은 그대로)
  const swipe = useRef(null)
  const [dragX, setDragX] = useState(0)
  const onTouchStart = e => { const p = e.touches[0]; swipe.current = { x: p.clientX, y: p.clientY, dx: 0, lock: null } }
  const onTouchMove = e => {
    const sw = swipe.current
    if (!sw) return
    const p = e.touches[0], dx = p.clientX - sw.x, dy = p.clientY - sw.y
    if (!sw.lock && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) sw.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (sw.lock === 'x') { sw.dx = dx; setDragX(dx) }
  }
  const onTouchEnd = () => {
    const sw = swipe.current
    swipe.current = null
    if (sw?.lock === 'x' && Math.abs(sw.dx) > 50) {
      const n = sw.dx < 0 ? 1 : -1
      yearPage === null ? moveMonth(n) : setYearPage(y => y + n * 12)
    }
    setDragX(0)
  }
  const goToday = () => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(todayStr()); setShowLove(false) }

  async function save() {
    if (!edit.text.trim()) return
    const row = { date: edit.date, time: edit.time ? (edit.end ? `${edit.time}~${edit.end}` : edit.time) : null, title: edit.text.trim(), memo: '', done: edit.done }
    if (edit.tag !== undefined) row.tag = edit.tag || null
    if (edit.place?.trim() || edit.place0) row.place = edit.place?.trim() || null
    const { error } = edit.id
      ? await supabase.from('events').update(row).eq('id', edit.id)
      : await supabase.from('events').insert(row)
    if (error) return setErr(/place/.test(error.message) ? '일정 장소를 쓰려면 supabase_setup.sql 의 events place 줄을 실행하세요.' : /tag/.test(error.message) ? '일정 태그를 쓰려면 supabase_setup.sql 의 events tag 줄을 실행하세요.' : error.message)
    setEdit(null); reload()
  }
  async function remove() {
    if (!confirm('이 일정을 삭제할까요?')) return
    const { error } = await supabase.from('events').delete().eq('id', edit.id)
    if (error) return setErr(error.message)
    setEdit(null); reload()
  }
  async function toggleDone(e) {
    const { error } = await supabase.from('events').update({ done: !e.done }).eq('id', e.id)
    if (error) return setErr(error.message)
    reload()
  }

  const t = todayStr()
  const dayEvents = byDate[sel] || []

  // 생리·관계 기록
  // 생리 정보 표시 켜기/끄기 (이 기기에만 기억)
  const [showCycle, setShowCycle] = useState(() => { try { return localStorage.getItem('notes.showCycle') !== '0' } catch { return true } })
  useEffect(() => { try { localStorage.setItem('notes.showCycle', showCycle ? '1' : '0') } catch {} }, [showCycle])
  const info = useMemo(() => showCycle && body.ready ? cycleInfo(body.periods, t) : null, [showCycle, body, t])
  // 관계일은 달력에 표시하지 않고, 날짜를 골랐을 때 버튼 상태로만 보여준다
  const loveDays = useMemo(() => new Set(body.loves.map(l => l.date)), [body])
  const selPeriod = info?.ps.find(p => p.start_date <= sel && sel <= info.endOf(p))
  const justEnded = !selPeriod && info?.ps.find(p => p.end_date && p.end_date < sel && sel <= addDays(p.end_date, 3))
  const periodAction = !selPeriod
    ? (justEnded ? { label: '생리 여기까지 연장', run: () => supabase.from('periods').update({ end_date: sel }).eq('id', justEnded.id) }
      : { label: '생리 시작', run: () => supabase.from('periods').insert({ start_date: sel }) })
    : selPeriod.start_date === sel
      ? { label: '생리 시작일', active: true, run: () => confirm('이 생리 기록을 삭제할까요?') && supabase.from('periods').delete().eq('id', selPeriod.id) }
      : selPeriod.end_date === sel
        ? { label: `생리 ${diffDays(selPeriod.start_date, sel) + 1}일차 · 마지막 날`, active: true, run: () => supabase.from('periods').update({ end_date: null }).eq('id', selPeriod.id) }
        : { label: `생리 ${diffDays(selPeriod.start_date, sel) + 1}일차 · 여기서 끝`, active: true, run: () => supabase.from('periods').update({ end_date: sel }).eq('id', selPeriod.id) }
  // 저장·새로고침이 끝날 때까지 다음 탭은 무시 (빠른 두 번 탭으로 중복 기록되지 않게)
  const bodyBusy = useRef(false)
  const [busy, setBusy] = useState(false)
  async function runBody(action) {
    if (bodyBusy.current) return
    bodyBusy.current = true; setBusy(true)
    try {
      const res = await action()
      // 23505 = 이미 같은 날 기록이 있음 → 원하는 상태와 같으니 오류로 보지 않음
      if (res?.error && res.error.code !== '23505') setErr(res.error.message)
      await reloadBody()
    } finally {
      bodyBusy.current = false; setBusy(false)
    }
  }
  const loved = loveDays.has(sel)
  // 관계 버튼은 평소 숨김: 날짜를 길게 누르면 그 날짜에서만 나타나고, 다른 날짜를 탭하면 다시 숨김
  const [showLove, setShowLove] = useState(false)
  const press = useRef({ timer: null, fired: false, x: 0, y: 0 })
  const pressStart = (k, e) => {
    clearTimeout(press.current.timer)
    press.current = { fired: false, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      press.current.fired = true; setSel(k); setShowLove(true); navigator.vibrate?.(10)
    }, 500) }
  }
  const pressMove = e => { if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) clearTimeout(press.current.timer) }
  const pressEnd = () => clearTimeout(press.current.timer)
  const tapDay = k => {
    if (press.current.fired) { press.current.fired = false; return }
    setSel(k); setShowLove(false)
  }
  const toggleLove = () => runBody(() => loved
    ? supabase.from('intimacy_logs').delete().eq('date', sel)
    : supabase.from('intimacy_logs').insert({ date: sel }))

  let summary = null
  if (info) {
    const n = diffDays(t, info.nextStart)
    const main = info.ongoing ? `생리 ${diffDays(info.last.start_date, t) + 1}일차`
      : n > 0 ? `다음 생리 ${atMidnight(info.nextStart).getMonth() + 1}월 ${atMidnight(info.nextStart).getDate()}일 · D-${n}`
      : n === 0 ? '오늘 생리 예정일' : `생리 예정일 ${-n}일 지남`
    summary = [main, info.fertileDays.has(t) && !info.ongoing ? (info.ovulationDays.has(t) ? '배란 예정일' : '가임기') : null, `평균 주기 ${info.cycle}일`].filter(Boolean)
  }
  const open = e => { const [time = '', end = ''] = (e.time || '').split('~'); setEdit({ ...e, time, end, text: joinText(e.title, e.memo), place: e.place || '', place0: e.place || '' }) }
  const chevron = { ...plain, color: C.sub, display: 'flex', padding: 6, borderRadius: 8 }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 2px 12px' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 20, fontWeight: 700 }}>
          <button onClick={() => setYearPage(yearPage === null ? month.getFullYear() - 5 : null)} aria-expanded={yearPage !== null} style={{
            ...plain, display: 'flex', alignItems: 'center', gap: 2, fontSize: 20, fontWeight: 700, color: yearPage === null ? C.text : C.sub,
          }}>{month.getFullYear()}년<ChevronDown size={16} style={{ transform: yearPage === null ? 'none' : 'rotate(180deg)', transition: 'transform .15s' }} /></button>
          {yearPage === null && <span>{month.getMonth() + 1}월</span>}
        </div>
        <button aria-label="생리 정보 표시" aria-pressed={showCycle} title={showCycle ? '생리 정보 숨기기' : '생리 정보 보기'} onClick={() => setShowCycle(v => !v)}
          style={{ ...chevron, marginRight: 2 }}><Droplet size={18} color={showCycle ? BODY.period : C.faint} fill={showCycle ? BODY.period : 'none'} /></button>
        <button aria-label={yearPage === null ? '이전 달' : '이전 연도들'} style={chevron} onClick={() => yearPage === null ? moveMonth(-1) : setYearPage(yearPage - 12)}><ChevronLeft size={22} /></button>
        <button onClick={() => { goToday(); setYearPage(null) }} style={{ ...plain, fontSize: 13, fontWeight: 600, color: C.tint, background: C.tintSoft, borderRadius: 999, padding: '6px 12px' }}>오늘</button>
        <button aria-label={yearPage === null ? '다음 달' : '다음 연도들'} style={chevron} onClick={() => yearPage === null ? moveMonth(1) : setYearPage(yearPage + 12)}><ChevronRight size={22} /></button>
      </div>

      {summary && yearPage === null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', fontSize: 13, color: C.sub, padding: '0 4px 10px' }}>
          <Droplet size={13} color={BODY.period} fill={BODY.period} />
          {summary.map((x, i) => <span key={i} style={i === 0 ? { color: C.text, fontWeight: 600 } : null}>{i > 0 && '· '}{x}</span>)}
        </div>
      )}

      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{ background: C.card, borderRadius: 16, padding: '12px 6px 6px', marginBottom: 24, border: `0.5px solid ${C.sep}`, overflow: 'hidden', touchAction: 'pan-y' }}>
        {yearPage !== null ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '4px 6px 6px', transform: `translateX(${dragX * 0.5}px)`, transition: dragX ? 'none' : 'transform .2s ease' }}>
            {Array.from({ length: 12 }, (_, i) => yearPage + i).map(y => {
              const isSel = y === month.getFullYear(), isNow = y === new Date().getFullYear()
              return (
                <button key={y} onClick={() => pickYear(y)} style={{
                  ...plain, height: 48, borderRadius: 12, fontSize: 16, fontWeight: isSel || isNow ? 700 : 400,
                  background: isSel ? C.tint : isNow ? C.tintSoft : 'transparent', color: isSel ? '#fff' : C.text,
                }}>{y}</button>
              )
            })}
          </div>
        ) : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', paddingBottom: 6 }}>
          {WEEK.map((w, i) => (
            <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: i === 0 || i === 6 ? C.faint : C.sub }}>{w}</div>
          ))}
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          transform: `translateX(${dragX * 0.5}px)`, opacity: 1 - Math.min(Math.abs(dragX) / 400, 0.4),
          transition: dragX ? 'none' : 'transform .2s ease, opacity .2s ease',
        }}>
          {cells.map((d, i) => {
            const k = ymd(d), inMonth = d.getMonth() === month.getMonth(), evs = byDate[k] || []
            const isSel = k === sel, isToday = k === t, weekend = d.getDay() === 0 || d.getDay() === 6
            const isPeriod = info?.periodDays.has(k), isPredicted = info?.predictedDays.has(k), isFertile = info?.fertileDays.has(k) && !isPeriod && !isPredicted
            const bg = isSel ? (TAGS[tagFilter]?.color || CAL_TINT) : isPeriod ? BODY.periodSoft : isToday ? C.tintSoft : isFertile ? BODY.fertileSoft : 'transparent'
            const fg = isSel ? '#fff' : isPeriod || isPredicted ? BODY.period : isToday ? C.tint : isFertile ? BODY.fertile : weekend ? C.sub : C.text
            return (
              <button key={k} onClick={() => tapDay(k)} onPointerDown={e => pressStart(k, e)} onPointerMove={pressMove} onPointerUp={pressEnd} onPointerLeave={pressEnd} onPointerCancel={pressEnd}
                onContextMenu={e => e.preventDefault()} style={{
                ...plain, height: 44, WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 2, visibility: inMonth ? 'visible' : 'hidden',
              }}>
                <span style={{
                  width: 32, height: 32, lineHeight: isPredicted && !isSel ? '29px' : '32px', textAlign: 'center', borderRadius: 12, fontSize: 16,
                  fontWeight: isToday || isSel || (isFertile && info.ovulationDays.has(k)) ? 700 : 400, background: bg, color: fg,
                  border: isPredicted && !isSel ? `1.5px dashed ${BODY.period}80` : 'none',
                }}>{d.getDate()}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, height: 7 }}>
                  {evs.slice(0, 3).map(e => <span key={e.id} style={{ width: 6, height: 6, borderRadius: '50%', background: e.done ? C.faint : eventColor(e) }} />)}
                </span>
              </button>
            )
          })}
        </div>
        </>}
      </div>

      {yearPage === null && (showCycle || showLove) && (
        <div style={{ margin: '-12px 0 18px' }}>
          {body.ready ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {showCycle && <button onClick={() => runBody(periodAction.run)} disabled={busy} style={{ opacity: busy ? 0.6 : 1,
                ...plain, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, borderRadius: 999, padding: '5px 12px',
                background: periodAction.active ? BODY.periodSoft : C.card, color: periodAction.active ? BODY.period : C.text, border: `0.5px solid ${periodAction.active ? 'transparent' : C.sep}`,
              }}><Droplet size={14} color={BODY.period} fill={periodAction.active ? BODY.period : 'none'} />{periodAction.label}</button>}
              {showLove && <button onClick={toggleLove} disabled={busy} aria-pressed={loved} style={{ opacity: busy ? 0.6 : 1,
                ...plain, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, borderRadius: 999, padding: '5px 12px',
                background: loved ? BODY.loveSoft : C.card, color: loved ? BODY.love : C.text, border: `0.5px solid ${loved ? 'transparent' : C.sep}`,
              }}><Heart size={14} color={BODY.love} fill={loved ? BODY.love : 'none'} />관계</button>}
            </div>
          ) : body.missing && (
            <div style={{ fontSize: 13, color: C.sub }}>생리·관계 기록을 쓰려면 supabase_setup.sql 의 periods / intimacy_logs 섹션을 실행하세요.</div>
          )}
          {info && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: C.sub, marginTop: 10, paddingLeft: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: BODY.periodSoft, border: `1px solid ${BODY.period}` }} />생리</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 10, height: 10, borderRadius: 3, border: `1.5px dashed ${BODY.period}80` }} />예정</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: BODY.fertileSoft, border: `1px solid ${BODY.fertile}66` }} />가임기</span>
            </div>
          )}
        </div>
      )}

      {hasTags && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '-8px 0 16px', paddingBottom: 2 }}>
          <TagChip small allColor={CAL_TINT} on={!tagFilter} onClick={() => setTagFilter('')} />
          {Object.keys(TAGS).map(k => <TagChip key={k} tag={k} small on={tagFilter === k} onClick={() => setTagFilter(tagFilter === k ? '' : k)} />)}
        </div>
      )}

      <Group header={fmtDate(sel)}>
        {dayEvents.length === 0 && <Row last><span style={{ color: C.sub, fontSize: 15 }}>비어 있는 날이에요</span></Row>}
        {dayEvents.map((e, i) => <EventRow key={e.id} e={e} last={i === dayEvents.length - 1} onToggle={() => toggleDone(e)} onClick={() => open(e)} />)}
      </Group>

      {upcoming.map(([label, es]) => (
        <Group key={label} header={label}>
          {es.map((e, i) => <EventRow key={e.id} e={e} showDate last={i === es.length - 1} onToggle={() => toggleDone(e)} onClick={() => open(e)} />)}
        </Group>
      ))}

      <Fab label="일정 추가" color={TAGS[tagFilter]?.color || CAL_TINT} onClick={() => setEdit({ date: sel, time: '', end: '', text: '', done: false, ...(tagFilter ? { tag: tagFilter } : {}) })} />

      {edit && (
        <Sheet title={edit.id ? '일정 편집' : '새 일정'} tint={TAGS[edit.tag]?.color || CAL_TINT} onCancel={() => setEdit(null)} onDone={save} doneDisabled={!edit.text.trim()}>
          <Group>
            <GrowTextarea autoFocus={!edit.id} value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} placeholder="무슨 일정인가요?"
              style={{ ...field, display: 'block', padding: '12px 16px', resize: 'none', lineHeight: 1.4 }} />
          </Group>
          <CallChips text={edit.text} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '-8px 0 16px' }}>
            {Object.keys(TAGS).map(k => <TagChip key={k} tag={k} on={edit.tag === k} onClick={() => setEdit({ ...edit, tag: edit.tag === k ? '' : k })} />)}
          </div>
          <Group>
            <Row>
              <span style={{ flex: 1, fontSize: 16 }}>날짜</span>
              <input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })}
                style={{ ...field, width: 'auto', background: C.fill, borderRadius: 6, padding: '6px 10px' }} />
            </Row>
            {/* 시간: 비워 두면 하루 종일, 끝나는 시간은 선택 (time 칸에 'HH:MM~HH:MM'로 저장) — 누르면 아래에 칩 */}
            <Row last={!pickTime}>
              <span style={{ flex: 1, fontSize: 16, whiteSpace: 'nowrap' }}>시간</span>
              {(() => {
                const tint = TAGS[edit.tag]?.color || CAL_TINT
                const btn = (which, label, empty) => (
                  <button type="button" onClick={() => {
                    if (which === 'start' && !edit.time) setEdit({ ...edit, time: '09:00' })
                    setPickTime(pickTime === which ? null : which)
                  }} style={{
                    ...plain, fontSize: 15, borderRadius: 8, padding: '6px 10px', whiteSpace: 'nowrap',
                    background: pickTime === which ? tint + '1f' : C.fill, color: empty ? C.sub : pickTime === which ? tint : C.text, fontWeight: pickTime === which ? 600 : 400,
                  }}>{label}</button>
                )
                return <>
                  {btn('start', edit.time ? fmtTime(edit.time) : '하루 종일', !edit.time)}
                  {edit.time && <>
                    <span style={{ color: C.sub, margin: '0 -4px' }}>~</span>
                    {btn('end', edit.end ? fmtTime(edit.end) : '끝 시간', !edit.end)}
                    <button type="button" aria-label="시간 지우기 (하루 종일)" onClick={() => { setEdit({ ...edit, time: '', end: '' }); setPickTime(null) }}
                      style={{ ...plain, color: C.sub, fontSize: 18, padding: '0 2px', lineHeight: 1 }}>×</button>
                  </>}
                </>
              })()}
            </Row>
            {pickTime === 'start' && edit.time && (
              <TimeChips value={edit.time} fallback="09:00" tint={TAGS[edit.tag]?.color || CAL_TINT} onChange={v => setEdit({ ...edit, time: v })} />
            )}
            {pickTime === 'end' && edit.time && (
              <TimeChips value={edit.end} fallback={addHour(edit.time)} canClear tint={TAGS[edit.tag]?.color || CAL_TINT} onChange={v => setEdit({ ...edit, end: v })} />
            )}
          </Group>
          {/* 장소: 적으면 목록에 표시, 지도 버튼으로 네이버 지도 검색 */}
          <Group>
            <Row last>
              <MapPin size={18} color={C.sub} style={{ flexShrink: 0 }} />
              <input value={edit.place || ''} onChange={e => setEdit({ ...edit, place: e.target.value })} placeholder="장소"
                style={{ ...field, flex: 1, minWidth: 0, fontSize: 16 }} />
              {edit.place?.trim() && <a href={mapHref(edit.place)} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: TAGS[edit.tag]?.color || CAL_TINT, background: (TAGS[edit.tag]?.color || CAL_TINT) + '1a', borderRadius: 999, padding: '5px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }}>지도</a>}
            </Row>
          </Group>
          {edit.id && (
            <Group>
              <Row last onClick={remove}>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 16, color: C.red }}>삭제</span>
              </Row>
            </Group>
          )}
        </Sheet>
      )}
    </>
  )
}

// ───────────── 시간 칩 (휴대폰 기본 시계 다이얼 대신) ─────────────
const MINUTES = ['00', '10', '15', '20', '30', '40', '45', '50']
const fmtTime = v => {
  if (!v) return ''
  const [h, m] = v.split(':').map(Number)
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`
}
const addHour = v => { const [h, m] = v.split(':'); return `${String((Number(h) + 1) % 24).padStart(2, '0')}:${m}` }

// value: 'HH:MM' 또는 '' — 오전/오후·시·분 칩, canClear면 '없음' 칩
function TimeChips({ value, fallback, onChange, tint, canClear }) {
  const v = value || fallback
  const [h, m] = v.split(':').map(Number)
  const pm = h >= 12, h12 = h % 12 || 12
  const set = (nh, nm) => onChange(`${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`)
  const chip = (on, label, onClick, key) => (
    <button key={key ?? label} type="button" onClick={onClick} style={{
      ...plain, flex: '1 0 auto', minWidth: 0, padding: '8px 0', borderRadius: 10, fontSize: 15, fontWeight: on ? 700 : 500,
      background: on ? tint : C.fill, color: on ? '#fff' : C.text, textAlign: 'center',
    }}>{label}</button>
  )
  const grid = n => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 6 })
  return (
    <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={grid(canClear ? 3 : 2)}>
        {chip(value && !pm, '오전', () => set(h12 % 12, m))}
        {chip(value && pm, '오후', () => set(h12 % 12 + 12, m))}
        {canClear && chip(!value, '없음', () => onChange(''))}
      </div>
      <div style={grid(6)}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(n => chip(value && h12 === n, n, () => set((n % 12) + (pm ? 12 : 0), m), 'h' + n))}
      </div>
      <div style={grid(4)}>
        {MINUTES.map(mm => chip(value && m === Number(mm), ':' + mm, () => set(h, Number(mm)), 'm' + mm))}
      </div>
    </div>
  )
}

const mapHref = place => `https://map.naver.com/p/search/${encodeURIComponent(place.trim())}`

function EventRow({ e, showDate, last, onToggle, onClick }) {
  const [first, ...rest] = joinText(e.title, e.memo).split('\n')
  return (
    <Row onClick={onClick} last={last}>
      <CheckCircle done={e.done} color={TAGS[e.tag]?.color || CAL_TINT} onClick={ev => { ev.stopPropagation(); onToggle() }} />
      <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: eventColor(e), opacity: e.done ? 0.4 : 1 }} />
      <div style={{ flex: 1, minWidth: 0, opacity: e.done ? 0.45 : 1 }}>
        {/* 제목은 두 줄, 내용은 세 줄까지 */}
        <div style={{ fontSize: 16, lineHeight: 1.35, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {TAGS[e.tag] && <span style={{ color: TAGS[e.tag].color, background: TAGS[e.tag].color + '1c', fontWeight: 600, fontSize: 12, borderRadius: 6, padding: '1px 6px', marginRight: 8, verticalAlign: 2 }}>{TAGS[e.tag].label}</span>}
          {first}
        </div>
        {e.place && <a href={mapHref(e.place)} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13.5, color: C.sub, marginTop: 2, textDecoration: 'none', overflow: 'hidden' }}>
          <MapPin size={13} style={{ flexShrink: 0 }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.place}</span></a>}
        {rest.length > 0 && <div style={{ fontSize: 14, lineHeight: 1.4, color: C.sub, marginTop: 2, whiteSpace: 'pre-line', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{rest.join('\n')}</div>}
      </div>
      <div style={{ fontSize: 14, color: C.sub, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {showDate && <div>{new Date(e.date).getMonth() + 1}월 {new Date(e.date).getDate()}일</div>}
        <div>{e.time ? e.time.split('~').map(t => t.slice(0, 5)).join(' ~ ') : (!showDate && '종일')}</div>
      </div>
    </Row>
  )
}

// ───────────────────────── 앱 ─────────────────────────
export default function NotesApp({ initialTab = 'memo' }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState(initialTab)
  // 하단 탭으로 /notes ↔ /notes/calendar 이동 시 화면 전환
  useEffect(() => { setTab(initialTab) }, [initialTab])
  const tabBar = useShowTabBar()
  const [memos, setMemos] = useState([])
  const [events, setEvents] = useState([])
  const [err, setErr] = useState('')
  const [body, setBody] = useState({ ready: false, missing: false, periods: [], loves: [] })

  async function loadMemos() {
    const { data, error } = await supabase.from('memos').select('*')
    if (error) return setErr(error.message)
    setMemos(data)
  }
  async function loadEvents() {
    const { data, error } = await supabase.from('events').select('*')
    if (error) return setErr(error.message)
    setEvents(data)
  }
  // 생리·관계 기록은 테이블이 아직 없어도 나머지 화면은 정상 동작하도록 따로 처리
  async function loadBody() {
    const [p, l] = await Promise.all([supabase.from('periods').select('*'), supabase.from('intimacy_logs').select('*')])
    if (p.error || l.error) return setBody(b => ({ ...b, ready: false, missing: true }))
    setBody({ ready: true, missing: false, periods: p.data, loves: l.data })
  }
  useEffect(() => { loadMemos(); loadEvents(); loadBody() }, [])

  const switchTab = t => { setTab(t); navigate(t === 'memo' ? '/notes' : '/notes/calendar', { replace: true }) }
  // 메모 화면 안의 메모 | 노트(강의노트처럼 긴 글·파일) 전환, 마지막 선택 기억
  const [kind, setKind] = useState(() => { try { return localStorage.getItem('notes-kind') || 'memo' } catch { return 'memo' } })
  const pickKind = k => { setKind(k); try { localStorage.setItem('notes-kind', k) } catch {} }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: F, color: C.text, WebkitFontSmoothing: 'antialiased', letterSpacing: '-0.01em' }}>
      <header style={{ maxWidth: 680, margin: '0 auto', padding: `calc(${tabBar ? 8 : 16}px + env(safe-area-inset-top)) 12px ${tabBar ? 0 : 8}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* 하단 탭이 있으면 지금 화면 이름을 작은 제목(22px)으로 */}
          {tabBar ? <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: '38px' }}>{tab === 'memo' ? '메모' : '일정'}</div> : (
            <button onClick={() => navigate('/budget')} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 2, color: C.sub, fontSize: 13 }}>
              <ChevronLeft size={16} />가계부
            </button>
          )}
          <InstallButton />
        </div>
        {/* 하단 탭이 있으면 메모/일정 큰 제목은 생략 */}
        {!tabBar && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 10 }}>
            {[['memo', '메모'], ['calendar', '일정']].map(([k, label]) => (
              <button key={k} onClick={() => switchTab(k)} style={{
                ...plain, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: tab === k ? C.text : C.faint, transition: 'color .15s',
              }}>{label}</button>
            ))}
          </div>
        )}
      </header>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '10px 12px calc(100px + var(--tabbar, 0px) + env(safe-area-inset-bottom))' }}>
        {err && (
          <div onClick={() => setErr('')} style={{ background: C.card, color: C.red, borderRadius: 12, padding: '12px 16px', fontSize: 15, marginBottom: 16, cursor: 'pointer' }}>
            {err} {/relation|does not exist|schema cache|bucket/i.test(err) && '— supabase_setup.sql 의 최신 섹션을 실행하세요.'}
          </div>
        )}
        {tab === 'memo' && (
          <div style={{ display: 'flex', background: C.fill, borderRadius: 9, padding: 2, marginBottom: 12 }}>
            {[['memo', '메모'], ['note', '노트']].map(([k, label]) => (
              <button key={k} onClick={() => pickKind(k)} aria-pressed={kind === k} style={{ ...plain, flex: 1, fontSize: 13, fontWeight: 600, borderRadius: 7, padding: '6px 0', background: kind === k ? '#fff' : 'transparent', color: kind === k ? C.text : C.sub, boxShadow: kind === k ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' }}>{label}</button>
            ))}
          </div>
        )}
        {tab === 'memo'
          ? (kind === 'note'
            ? <LectureNotes setErr={setErr} onMovedToMemo={() => { loadMemos(); pickKind('memo') }} />
            : <MemoTab memos={memos} reload={loadMemos} setErr={setErr} onMovedToNote={() => pickKind('note')} />)
          : <CalendarTab events={events} reload={loadEvents} setErr={setErr} body={body} reloadBody={loadBody} />}
      </main>
    </div>
  )
}
