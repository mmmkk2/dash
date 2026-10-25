import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin, Search, ChevronLeft, ChevronRight, SquarePen, Plus, Check } from 'lucide-react'
import { supabase } from './pages/login'

// iOS 시스템 폰트·색상 (라이트)
const F = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Apple SD Gothic Neo','Noto Sans KR',sans-serif"
const C = {
  bg: '#f2f2f7', card: '#fff', text: '#000', sub: 'rgba(60,60,67,0.6)', faint: 'rgba(60,60,67,0.3)',
  sep: 'rgba(60,60,67,0.18)', fill: 'rgba(118,118,128,0.12)',
  tint: '#007aff', red: '#ff3b30', orange: '#ff9500', green: '#34c759',
}
const COLORS = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#8e8e93']
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const BAR = 'rgba(249,249,249,0.86)'

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayStr = () => ymd(new Date())
// 예전 제목 필드가 있던 데이터는 본문 앞에 붙여서 한 덩어리로 다룬다
const joinText = (a, b) => [a, b].filter(Boolean).join('\n')
const daysUntil = s => Math.round((new Date(s) - new Date(todayStr())) / 86400000)

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
  if (n === 0) return ['오늘 마감', C.orange]
  return [`D-${n}`, n <= 3 ? C.orange : C.sub]
}

const plain = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: F }
const field = { ...plain, cursor: 'text', outline: 'none', fontSize: 17, color: C.text, width: '100%' }

// ───────────────────────── 공통 iOS 컴포넌트 ─────────────────────────
function Group({ header, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      {header && <div style={{ fontSize: 13, color: C.sub, padding: '0 16px 7px' }}>{header}</div>}
      <div style={{ background: C.card, borderRadius: 12, overflow: 'hidden' }}>{children}</div>
    </section>
  )
}

function Row({ children, onClick, last, style }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, paddingLeft: 16, cursor: onClick ? 'pointer' : 'default', ...style }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px 11px 0', borderBottom: last ? 'none' : `0.5px solid ${C.sep}`, alignSelf: 'stretch' }}>
        {children}
      </div>
    </div>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} style={{
      ...plain, width: 51, height: 31, borderRadius: 16, flexShrink: 0, position: 'relative',
      background: on ? C.green : 'rgba(120,120,128,0.16)', transition: 'background .2s',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 22 : 2, width: 27, height: 27, borderRadius: '50%', background: '#fff',
        boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.06)', transition: 'left .2s',
      }} />
    </button>
  )
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} style={{
          ...plain, width: 26, height: 26, borderRadius: '50%', background: c,
          boxShadow: value === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none',
        }} />
      ))}
    </div>
  )
}

function Sheet({ title, onCancel, onDone, onBackdrop = onCancel, doneDisabled, children }) {
  return (
    <div onClick={onBackdrop} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.bg, width: '100%', maxWidth: 560, borderRadius: '12px 12px 0 0', maxHeight: '92dvh', overflowY: 'auto',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -10px 40px rgba(0,0,0,0.12)',
      }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: C.bg, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '14px 16px 10px' }}>
          <button onClick={onCancel} style={{ ...plain, fontSize: 17, color: C.tint, justifySelf: 'start' }}>취소</button>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
          <button onClick={onDone} disabled={doneDisabled} style={{ ...plain, fontSize: 17, fontWeight: 600, color: doneDisabled ? C.faint : C.tint, justifySelf: 'end', cursor: doneDisabled ? 'default' : 'pointer' }}>완료</button>
        </div>
        <div style={{ padding: '8px 16px 0' }}>{children}</div>
      </div>
    </div>
  )
}

function LargeTitle({ children, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '6px 4px 10px' }}>
      <div style={{ flex: 1 }}>
        {sub && <div style={{ fontSize: 15, color: C.sub, marginBottom: 2 }}>{sub}</div>}
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.15 }}>{children}</h1>
      </div>
      {right}
    </div>
  )
}

function Toolbar({ left, center, right }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, background: BAR, backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      borderTop: `0.5px solid ${C.sep}`, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', height: 49, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 16px' }}>
        <div style={{ justifySelf: 'start' }}>{left}</div>
        <div style={{ fontSize: 11, color: C.sub }}>{center}</div>
        <div style={{ justifySelf: 'end' }}>{right}</div>
      </div>
    </div>
  )
}

// ───────────────────────── 메모 ─────────────────────────
function MemoTab({ memos, reload, setErr }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)

  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return memos
      .filter(m => !k || (m.title + ' ' + m.content).toLowerCase().includes(k))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [memos, q])
  const pinned = list.filter(m => m.pinned), others = list.filter(m => !m.pinned)

  async function save() {
    const row = { title: '', content: edit.content, due_date: edit.due_date || null, color: edit.color, pinned: edit.pinned, updated_at: new Date().toISOString() }
    if (!row.content.trim()) { setEdit(null); return }
    const { error } = edit.id
      ? await supabase.from('memos').update(row).eq('id', edit.id)
      : await supabase.from('memos').insert(row)
    if (error) return setErr(error.message)
    setEdit(null); reload()
  }
  async function remove() {
    if (!confirm('이 메모를 삭제할까요?')) return
    const { error } = await supabase.from('memos').delete().eq('id', edit.id)
    if (error) return setErr(error.message)
    setEdit(null); reload()
  }

  const open = m => setEdit({ ...m, content: joinText(m.title, m.content) })
  const renderRows = arr => arr.map((m, i) => {
    const [first, ...rest] = joinText(m.title, m.content).trim().split('\n')
    const preview = rest.join(' ').trim()
    const due = m.due_date && dueLabel(m.due_date)
    return (
      <Row key={m.id} onClick={() => open(m)} last={i === arr.length - 1}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {m.color && m.color !== COLORS[0] && <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />}
            <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{first}</div>
          </div>
          <div style={{ fontSize: 15, color: C.sub, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: C.text, opacity: 0.85 }}>{shortStamp(m.updated_at)}</span>
            {due && <span style={{ color: due[1], fontWeight: 500 }}>{'  '}{due[0]}</span>}
            {'  '}{preview || '추가 텍스트 없음'}
          </div>
        </div>
      </Row>
    )
  })

  return (
    <>
      <LargeTitle>메모</LargeTitle>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.fill, borderRadius: 10, padding: '7px 8px', marginBottom: 20 }}>
        <Search size={17} color={C.sub} strokeWidth={2.2} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="검색" style={{ ...field, fontSize: 17 }} />
      </label>

      {list.length === 0 && <div style={{ textAlign: 'center', color: C.sub, padding: '60px 0', fontSize: 17 }}>{q ? '결과 없음' : '메모 없음'}</div>}
      {pinned.length > 0 && <Group header={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Pin size={12} />고정됨</span>}>{renderRows(pinned)}</Group>}
      {others.length > 0 && <Group header={pinned.length > 0 ? '메모' : null}>{renderRows(others)}</Group>}

      <Toolbar
        center={list.length > 0 && `메모 ${memos.length}개`}
        right={<button aria-label="새 메모" onClick={() => setEdit({ content: '', color: COLORS[0], pinned: false })} style={{ ...plain, color: C.tint, display: 'flex' }}><SquarePen size={24} strokeWidth={1.8} /></button>}
      />

      {edit && (
        <Sheet title={edit.id ? '메모' : '새로운 메모'} onCancel={() => setEdit(null)} onDone={save} onBackdrop={save}>
          <Group>
            <textarea autoFocus value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })} placeholder="메모" rows={10}
              style={{ ...field, display: 'block', padding: '12px 16px', resize: 'none', lineHeight: 1.45, minHeight: 200 }} />
          </Group>
          <Group>
            <Row>
              <span style={{ flex: 1, fontSize: 17 }}>마감일</span>
              <Toggle on={!!edit.due_date} onChange={on => setEdit({ ...edit, due_date: on ? todayStr() : '' })} />
            </Row>
            {edit.due_date && (
              <Row>
                <span style={{ flex: 1, fontSize: 17 }}>날짜</span>
                <input type="date" value={edit.due_date} onChange={e => setEdit({ ...edit, due_date: e.target.value })}
                  style={{ ...field, width: 'auto', background: C.fill, borderRadius: 6, padding: '6px 10px', color: C.tint }} />
              </Row>
            )}
            <Row>
              <span style={{ flex: 1, fontSize: 17 }}>고정</span>
              <Toggle on={!!edit.pinned} onChange={pinned => setEdit({ ...edit, pinned })} />
            </Row>
            <Row last>
              <span style={{ flex: 1, fontSize: 17 }}>색상</span>
              <ColorPicker value={edit.color} onChange={color => setEdit({ ...edit, color })} />
            </Row>
          </Group>
          {edit.id && (
            <Group>
              <Row last onClick={remove} style={{ justifyContent: 'center' }}>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 17, color: C.red }}>메모 삭제</span>
              </Row>
            </Group>
          )}
        </Sheet>
      )}
    </>
  )
}

// ───────────────────────── 일정 ─────────────────────────
function CalendarTab({ events, reload, setErr }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(todayStr())
  const [edit, setEdit] = useState(null)

  const byDate = useMemo(() => {
    const m = {}
    for (const e of events) (m[e.date] ||= []).push(e)
    for (const k in m) m[k].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
    return m
  }, [events])

  const cells = useMemo(() => {
    const start = new Date(month); start.setDate(1 - month.getDay())
    const weeks = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7)
    return Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])

  const upcoming = useMemo(() => {
    const t = todayStr()
    return events.filter(e => e.date > t && !e.done).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))).slice(0, 5)
  }, [events])

  const moveMonth = n => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const goToday = () => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(todayStr()) }

  async function save() {
    if (!edit.text.trim()) return
    const row = { date: edit.date, time: edit.time || null, title: edit.text.trim(), memo: '', color: edit.color, done: edit.done }
    const { error } = edit.id
      ? await supabase.from('events').update(row).eq('id', edit.id)
      : await supabase.from('events').insert(row)
    if (error) return setErr(error.message)
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
  const open = e => setEdit({ ...e, time: e.time || '', text: joinText(e.title, e.memo) })
  const chevron = { ...plain, color: C.red, display: 'flex', padding: 6 }

  return (
    <>
      <LargeTitle sub={`${month.getFullYear()}년`} right={
        <div style={{ display: 'flex', gap: 4, paddingBottom: 4 }}>
          <button aria-label="이전 달" style={chevron} onClick={() => moveMonth(-1)}><ChevronLeft size={24} /></button>
          <button aria-label="다음 달" style={chevron} onClick={() => moveMonth(1)}><ChevronRight size={24} /></button>
        </div>
      }>{month.getMonth() + 1}월</LargeTitle>

      <div style={{ background: C.card, borderRadius: 12, padding: '10px 6px 6px', marginBottom: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', paddingBottom: 6 }}>
          {WEEK.map((w, i) => (
            <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: i === 0 || i === 6 ? C.faint : C.sub }}>{w}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((d, i) => {
            const k = ymd(d), inMonth = d.getMonth() === month.getMonth(), evs = byDate[k] || []
            const isSel = k === sel, isToday = k === t, weekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <button key={k} onClick={() => setSel(k)} style={{
                ...plain, height: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 5,
                borderTop: i >= 7 ? `0.5px solid ${C.sep}` : 'none', visibility: inMonth ? 'visible' : 'hidden',
              }}>
                <span style={{
                  width: 32, height: 32, lineHeight: '32px', textAlign: 'center', borderRadius: '50%', fontSize: 19,
                  fontWeight: isToday || isSel ? 600 : 400,
                  background: isSel ? (isToday ? C.red : C.text) : 'transparent',
                  color: isSel ? '#fff' : isToday ? C.red : weekend ? C.sub : C.text,
                }}>{d.getDate()}</span>
                <span style={{ display: 'flex', gap: 3, height: 6 }}>
                  {evs.slice(0, 3).map(e => <span key={e.id} style={{ width: 6, height: 6, borderRadius: '50%', background: e.done ? C.faint : e.color }} />)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <Group header={fmtDate(sel)}>
        {dayEvents.length === 0 && <Row last><span style={{ color: C.sub, fontSize: 17 }}>일정 없음</span></Row>}
        {dayEvents.map((e, i) => <EventRow key={e.id} e={e} last={i === dayEvents.length - 1} onToggle={() => toggleDone(e)} onClick={() => open(e)} />)}
      </Group>

      {upcoming.length > 0 && (
        <Group header="다가오는 일정">
          {upcoming.map((e, i) => <EventRow key={e.id} e={e} showDate last={i === upcoming.length - 1} onToggle={() => toggleDone(e)} onClick={() => open(e)} />)}
        </Group>
      )}

      <Toolbar
        left={<button onClick={goToday} style={{ ...plain, fontSize: 17, color: C.red }}>오늘</button>}
        right={<button aria-label="일정 추가" onClick={() => setEdit({ date: sel, time: '', text: '', color: COLORS[0], done: false })} style={{ ...plain, color: C.red, display: 'flex' }}><Plus size={26} strokeWidth={1.8} /></button>}
      />

      {edit && (
        <Sheet title={edit.id ? '일정 편집' : '새로운 이벤트'} onCancel={() => setEdit(null)} onDone={save} doneDisabled={!edit.text.trim()}>
          <Group>
            <textarea autoFocus value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} placeholder="제목 및 메모" rows={3}
              style={{ ...field, display: 'block', padding: '12px 16px', resize: 'none', lineHeight: 1.4 }} />
          </Group>
          <Group>
            <Row>
              <span style={{ flex: 1, fontSize: 17 }}>날짜</span>
              <input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })}
                style={{ ...field, width: 'auto', background: C.fill, borderRadius: 6, padding: '6px 10px' }} />
            </Row>
            <Row>
              <span style={{ flex: 1, fontSize: 17 }}>하루 종일</span>
              <Toggle on={!edit.time} onChange={on => setEdit({ ...edit, time: on ? '' : '09:00' })} />
            </Row>
            {edit.time && (
              <Row>
                <span style={{ flex: 1, fontSize: 17 }}>시간</span>
                <input type="time" value={edit.time} onChange={e => setEdit({ ...edit, time: e.target.value })}
                  style={{ ...field, width: 'auto', background: C.fill, borderRadius: 6, padding: '6px 10px' }} />
              </Row>
            )}
            <Row last>
              <span style={{ flex: 1, fontSize: 17 }}>색상</span>
              <ColorPicker value={edit.color} onChange={color => setEdit({ ...edit, color })} />
            </Row>
          </Group>
          {edit.id && (
            <Group>
              <Row last onClick={remove}>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 17, color: C.red }}>이벤트 삭제</span>
              </Row>
            </Group>
          )}
        </Sheet>
      )}
    </>
  )
}

function EventRow({ e, showDate, last, onToggle, onClick }) {
  const [first, ...rest] = joinText(e.title, e.memo).split('\n')
  return (
    <Row onClick={onClick} last={last}>
      <button aria-label={e.done ? '완료 취소' : '완료'} onClick={ev => { ev.stopPropagation(); onToggle() }} style={{
        ...plain, width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: e.done ? 'none' : `1.5px solid ${C.faint}`, background: e.done ? e.color : 'transparent',
      }}>{e.done && <Check size={14} color="#fff" strokeWidth={3} />}</button>
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: e.color, opacity: e.done ? 0.4 : 1 }} />
      <div style={{ flex: 1, minWidth: 0, opacity: e.done ? 0.45 : 1 }}>
        <div style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{first}</div>
        {rest.length > 0 && <div style={{ fontSize: 15, color: C.sub, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rest.join(' ')}</div>}
      </div>
      <div style={{ fontSize: 15, color: C.sub, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {showDate && <div>{new Date(e.date).getMonth() + 1}월 {new Date(e.date).getDate()}일</div>}
        <div>{e.time ? e.time.slice(0, 5) : (!showDate && '하루 종일')}</div>
      </div>
    </Row>
  )
}

// ───────────────────────── 앱 ─────────────────────────
export default function NotesApp({ initialTab = 'memo' }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState(initialTab)
  const [memos, setMemos] = useState([])
  const [events, setEvents] = useState([])
  const [err, setErr] = useState('')

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
  useEffect(() => { loadMemos(); loadEvents() }, [])

  const switchTab = t => { setTab(t); navigate(t === 'memo' ? '/notes' : '/notes/calendar', { replace: true }) }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: F, color: C.text, WebkitFontSmoothing: 'antialiased', letterSpacing: '-0.01em' }}>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 10, background: BAR, backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: `0.5px solid ${C.sep}`, paddingTop: 'env(safe-area-inset-top)',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto', height: 44, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 8px' }}>
          <button onClick={() => navigate('/budget')} style={{ ...plain, justifySelf: 'start', display: 'flex', alignItems: 'center', color: C.tint, fontSize: 17 }}>
            <ChevronLeft size={26} strokeWidth={2.2} style={{ marginRight: -2 }} />가계부
          </button>
          <div style={{ display: 'flex', background: C.fill, borderRadius: 9, padding: 2 }}>
            {[['memo', '메모'], ['calendar', '일정']].map(([k, label]) => (
              <button key={k} onClick={() => switchTab(k)} style={{
                ...plain, borderRadius: 7, padding: '5px 22px', fontSize: 13, fontWeight: tab === k ? 600 : 500, color: C.text,
                background: tab === k ? '#fff' : 'transparent', boxShadow: tab === k ? '0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04)' : 'none',
              }}>{label}</button>
            ))}
          </div>
        </div>
      </nav>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '8px 16px calc(80px + env(safe-area-inset-bottom))' }}>
        {err && (
          <div onClick={() => setErr('')} style={{ background: C.card, color: C.red, borderRadius: 12, padding: '12px 16px', fontSize: 15, marginBottom: 16, cursor: 'pointer' }}>
            {err} {/relation|does not exist|schema cache/i.test(err) && '— supabase_setup.sql 의 memos/events 섹션(마감일 컬럼 포함)을 실행하세요.'}
          </div>
        )}
        {tab === 'memo'
          ? <MemoTab memos={memos} reload={loadMemos} setErr={setErr} />
          : <CalendarTab events={events} reload={loadEvents} setErr={setErr} />}
      </main>
    </div>
  )
}
