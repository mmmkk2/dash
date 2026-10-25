import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './pages/login'

const F = "'Apple SD Gothic Neo','Noto Sans KR','Inter',sans-serif"
const C = {
  bg: '#f5f7f9', card: '#fff', line: '#e5eaee', text: '#1f2a33', sub: '#6b7a86', faint: '#a3afb8',
  accent: '#177864', accentSoft: '#e6f3ef', danger: '#d1495b',
}
const COLORS = ['#177864', '#3a7bd5', '#e0882f', '#d1495b', '#8a5cd1', '#7a8791']
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayStr = () => ymd(new Date())
// 예전 제목 필드가 있던 데이터는 본문 앞에 붙여서 한 덩어리로 다룬다
const joinText = (a, b) => [a, b].filter(Boolean).join('\n')

function DueBadge({ due }) {
  const days = Math.round((new Date(due) - new Date(todayStr())) / 86400000)
  const [label, color, bg] = days < 0 ? [`${-days}일 지남`, '#d1495b', '#fdecee']
    : days === 0 ? ['오늘까지', '#c0661a', '#fdf1e4']
    : [`D-${days}`, days <= 3 ? '#c0661a' : '#52636e', days <= 3 ? '#fdf1e4' : '#eef2f4']
  return <span title={`마감 ${due}`} style={{ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 6, padding: '2px 6px' }}>{label}</span>
}

function fmtDate(s) {
  const d = new Date(s)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`
}

const btn = (primary) => ({
  border: primary ? 'none' : `1px solid ${C.line}`, background: primary ? C.accent : '#fff',
  color: primary ? '#fff' : C.text, borderRadius: 10, padding: '9px 14px', fontSize: 13,
  fontWeight: 600, cursor: 'pointer', fontFamily: F,
})
const input = {
  width: '100%', padding: '11px 12px', borderRadius: 10, border: `1px solid ${C.line}`,
  fontSize: 14, outline: 'none', fontFamily: F, background: '#fafbfc', color: C.text,
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} style={{
          width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
          border: value === c ? `3px solid ${C.text}` : '3px solid transparent', padding: 0,
        }} />
      ))}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,0.35)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: '20px 20px 0 0', padding: '20px 18px calc(20px + env(safe-area-inset-bottom))', maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 14 }}>{title}</div>
        {children}
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
      .sort((a, b) => (b.pinned - a.pinned) || b.updated_at.localeCompare(a.updated_at))
  }, [memos, q])

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
  async function togglePin(m) {
    const { error } = await supabase.from('memos').update({ pinned: !m.pinned }).eq('id', m.id)
    if (error) return setErr(error.message)
    reload()
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="메모 검색" style={input} />
        <button style={{ ...btn(true), whiteSpace: 'nowrap' }} onClick={() => setEdit({ content: '', color: COLORS[0], pinned: false })}>+ 새 메모</button>
      </div>
      {list.length === 0 && <div style={{ textAlign: 'center', color: C.faint, padding: 40, fontSize: 13 }}>{q ? '검색 결과가 없어요' : '첫 메모를 남겨보세요'}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {list.map(m => (
          <div key={m.id} onClick={() => setEdit({ ...m, content: joinText(m.title, m.content) })} style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `4px solid ${m.color}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', minHeight: 90 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ flex: 1, fontSize: 14, color: C.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{joinText(m.title, m.content)}</div>
              <button onClick={e => { e.stopPropagation(); togglePin(m) }} title="고정" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, opacity: m.pinned ? 1 : 0.25, padding: 0 }}>📌</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              {m.due_date && <DueBadge due={m.due_date} />}
              <span style={{ fontSize: 11, color: C.faint, marginLeft: 'auto' }}>{new Date(m.updated_at).toLocaleDateString('ko-KR')}</span>
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <Modal title={edit.id ? '메모 수정' : '새 메모'} onClose={save}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea autoFocus value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })} placeholder="메모" rows={10} style={{ ...input, resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: C.sub, whiteSpace: 'nowrap' }}>마감일</span>
              <input type="date" value={edit.due_date || ''} onChange={e => setEdit({ ...edit, due_date: e.target.value })} style={{ ...input, width: 'auto', flex: 1, padding: '8px 10px' }} />
              {edit.due_date && <button type="button" onClick={() => setEdit({ ...edit, due_date: '' })} style={{ ...btn(false), padding: '8px 10px' }}>없음</button>}
            </div>
            <ColorPicker value={edit.color} onChange={color => setEdit({ ...edit, color })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {edit.id && <button style={{ ...btn(false), color: C.danger }} onClick={remove}>삭제</button>}
              <button style={{ ...btn(false), marginLeft: 'auto' }} onClick={() => setEdit(null)}>취소</button>
              <button style={btn(true)} onClick={save}>저장</button>
            </div>
          </div>
        </Modal>
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
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])

  const upcoming = useMemo(() => {
    const t = todayStr()
    return events.filter(e => e.date >= t && !e.done).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))).slice(0, 5)
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

  return (
    <>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <button style={{ ...btn(false), padding: '6px 10px' }} onClick={() => moveMonth(-1)}>‹</button>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.text, minWidth: 110, textAlign: 'center' }}>{month.getFullYear()}년 {month.getMonth() + 1}월</div>
          <button style={{ ...btn(false), padding: '6px 10px' }} onClick={() => moveMonth(1)}>›</button>
          <button style={{ ...btn(false), padding: '6px 10px', marginLeft: 'auto', fontSize: 12 }} onClick={goToday}>오늘</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {WEEK.map((w, i) => (
            <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0', color: i === 0 ? C.danger : i === 6 ? '#3a7bd5' : C.sub }}>{w}</div>
          ))}
          {cells.map(d => {
            const k = ymd(d), inMonth = d.getMonth() === month.getMonth(), evs = byDate[k] || []
            const isSel = k === sel, isToday = k === t
            return (
              <button key={k} onClick={() => setSel(k)} style={{
                minHeight: 62, border: 'none', borderRadius: 8, padding: '4px 3px', cursor: 'pointer', textAlign: 'left',
                background: isSel ? C.accentSoft : 'transparent', opacity: inMonth ? 1 : 0.35, fontFamily: F,
                display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden',
              }}>
                <span style={{
                  alignSelf: 'center', fontSize: 12, fontWeight: isToday ? 800 : 500, width: 22, height: 22, lineHeight: '22px', textAlign: 'center', borderRadius: '50%',
                  background: isToday ? C.accent : 'transparent', color: isToday ? '#fff' : d.getDay() === 0 ? C.danger : d.getDay() === 6 ? '#3a7bd5' : C.text,
                }}>{d.getDate()}</span>
                {evs.slice(0, 2).map(e => (
                  <span key={e.id} style={{ fontSize: 10, color: '#fff', background: e.color, borderRadius: 4, padding: '1px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: e.done ? 0.45 : 1, textDecoration: e.done ? 'line-through' : 'none' }}>{e.title.split('\n')[0]}</span>
                ))}
                {evs.length > 2 && <span style={{ fontSize: 10, color: C.sub, textAlign: 'center' }}>+{evs.length - 2}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{fmtDate(sel)}</div>
        <button style={{ ...btn(true), marginLeft: 'auto' }} onClick={() => setEdit({ date: sel, time: '', text: '', color: COLORS[0], done: false })}>+ 일정 추가</button>
      </div>
      {dayEvents.length === 0 && <div style={{ color: C.faint, fontSize: 13, padding: '10px 2px' }}>일정이 없어요</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dayEvents.map(e => <EventRow key={e.id} e={e} onToggle={() => toggleDone(e)} onClick={() => setEdit({ ...e, time: e.time || '', text: joinText(e.title, e.memo) })} />)}
      </div>

      {upcoming.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.text, margin: '22px 0 8px' }}>다가오는 일정</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(e => <EventRow key={e.id} e={e} showDate onToggle={() => toggleDone(e)} onClick={() => setEdit({ ...e, time: e.time || '', text: joinText(e.title, e.memo) })} />)}
          </div>
        </>
      )}

      {edit && (
        <Modal title={edit.id ? '일정 수정' : '새 일정'} onClose={() => setEdit(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea autoFocus value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} placeholder="일정" rows={3} style={{ ...input, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} style={input} />
              <input type="time" value={edit.time} onChange={e => setEdit({ ...edit, time: e.target.value })} style={input} />
            </div>
            <ColorPicker value={edit.color} onChange={color => setEdit({ ...edit, color })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {edit.id && <button style={{ ...btn(false), color: C.danger }} onClick={remove}>삭제</button>}
              <button style={{ ...btn(false), marginLeft: 'auto' }} onClick={() => setEdit(null)}>취소</button>
              <button style={{ ...btn(true), opacity: edit.text.trim() ? 1 : 0.5 }} onClick={save}>저장</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function EventRow({ e, showDate, onToggle, onClick }) {
  const [first, ...rest] = joinText(e.title, e.memo).split('\n')
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
      <input type="checkbox" checked={e.done} onClick={ev => ev.stopPropagation()} onChange={onToggle} style={{ width: 18, height: 18, accentColor: e.color, cursor: 'pointer' }} />
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: e.color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, textDecoration: e.done ? 'line-through' : 'none', opacity: e.done ? 0.5 : 1 }}>{first}</div>
        {rest.length > 0 && <div style={{ fontSize: 12, color: C.sub, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rest.join(' ')}</div>}
      </div>
      <div style={{ fontSize: 12, color: C.sub, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {showDate && <div>{fmtDate(e.date)}</div>}
        {e.time && <div>{e.time.slice(0, 5)}</div>}
      </div>
    </div>
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
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: F, color: C.text }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderBottom: `1px solid ${C.line}`, background: '#fff', fontSize: 12 }}>
        <button onClick={() => navigate('/budget')} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: F }}>← 가계부</button>
        <div style={{ display: 'flex', background: '#eef2f4', borderRadius: 10, padding: 3, marginLeft: 'auto' }}>
          {[['memo', '📝 메모'], ['calendar', '📅 일정']].map(([k, label]) => (
            <button key={k} onClick={() => switchTab(k)} style={{
              border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
              background: tab === k ? '#fff' : 'transparent', color: tab === k ? C.accent : C.sub,
              boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>{label}</button>
          ))}
        </div>
      </nav>
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '16px 16px 60px' }}>
        {err && (
          <div onClick={() => setErr('')} style={{ background: '#fdecee', color: C.danger, borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12, cursor: 'pointer' }}>
            오류: {err} {/relation|does not exist|schema cache/i.test(err) && '— supabase_setup.sql 의 memos/events 섹션(마감일 컬럼 포함)을 실행하세요.'}
          </div>
        )}
        {tab === 'memo'
          ? <MemoTab memos={memos} reload={loadMemos} setErr={setErr} />
          : <CalendarTab events={events} reload={loadEvents} setErr={setErr} />}
      </main>
    </div>
  )
}
