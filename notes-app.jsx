import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin, Search, ChevronLeft, ChevronRight, Plus, Check, ListChecks } from 'lucide-react'
import { supabase } from './pages/login'

// 시스템 폰트 + 차분한 라이트 톤, 포인트 컬러는 대시보드 그린
const F = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Apple SD Gothic Neo','Noto Sans KR',sans-serif"
const C = {
  bg: '#f5f5f2', card: '#fff', text: '#1c1c1e', sub: 'rgba(60,60,67,0.6)', faint: 'rgba(60,60,67,0.3)',
  sep: 'rgba(60,60,67,0.12)', fill: 'rgba(118,118,128,0.1)',
  tint: '#177864', tintSoft: '#e5f1ee', red: '#e5484d', orange: '#e8890c',
}
const COLORS = ['#177864', '#3b82c4', '#e8890c', '#e5484d', '#8b5cf6', '#8e8e93']
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
const field = { ...plain, cursor: 'text', outline: 'none', fontSize: 16, color: C.text, width: '100%' }

// ───────────────────────── 공통 컴포넌트 ─────────────────────────
function Group({ header, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      {header && <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, padding: '0 4px 8px' }}>{header}</div>}
      <div style={{ background: C.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)' }}>{children}</div>
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
      background: on ? C.tint : 'rgba(120,120,128,0.16)', transition: 'background .2s',
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
        background: C.bg, width: '100%', maxWidth: 560, borderRadius: '22px 22px 0 0', maxHeight: '92dvh', overflowY: 'auto',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -10px 40px rgba(0,0,0,0.12)',
      }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: C.bg, display: 'flex', alignItems: 'center', gap: 14, padding: '18px 16px 12px' }}>
          <div style={{ flex: 1, fontSize: 20, fontWeight: 700 }}>{title}</div>
          <button onClick={onCancel} style={{ ...plain, fontSize: 15, color: C.sub }}>취소</button>
          <button onClick={onDone} disabled={doneDisabled} style={{
            ...plain, fontSize: 15, fontWeight: 600, color: '#fff', background: C.tint, borderRadius: 999, padding: '8px 18px',
            opacity: doneDisabled ? 0.35 : 1, cursor: doneDisabled ? 'default' : 'pointer',
          }}>저장</button>
        </div>
        <div style={{ padding: '8px 16px 0' }}>{children}</div>
      </div>
    </div>
  )
}

function Fab({ label, onClick }) {
  return (
    <button aria-label={label} onClick={onClick} style={{
      ...plain, position: 'fixed', zIndex: 20, right: 'max(20px, calc(50% - 320px))', bottom: 'calc(24px + env(safe-area-inset-bottom))',
      width: 56, height: 56, borderRadius: '50%', background: C.tint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 6px 20px rgba(23,120,100,0.35)',
    }}><Plus size={26} strokeWidth={2.2} /></button>
  )
}

// ───────────────────────── 메모 ─────────────────────────
function CheckCircle({ done, color = C.tint, onClick }) {
  return (
    <button type="button" aria-label={done ? '체크 해제' : '체크'} onClick={onClick} style={{
      ...plain, width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: done ? 'none' : `1.5px solid ${C.faint}`, background: done ? color : 'transparent',
    }}>{done && <Check size={14} color="#fff" strokeWidth={3} />}</button>
  )
}

// 줄 단위 편집기: 일반 줄과 체크리스트 줄을 섞어 쓴다 (엔터 = 같은 종류의 새 줄)
function NoteEditor({ value, onChange, autoFocus }) {
  const lines = parseLines(value)
  const refs = useRef([])
  const cur = useRef(lines.length - 1)
  const [focus, setFocus] = useState(autoFocus ? { i: lines.length - 1, pos: Infinity } : null)

  useLayoutEffect(() => {
    refs.current.slice(0, lines.length).forEach(el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } })
  })
  useEffect(() => {
    const el = focus && refs.current[focus.i]
    if (!el) return
    el.focus()
    const p = Math.min(focus.pos, el.value.length)
    el.setSelectionRange(p, p)
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
      <div onClick={e => { if (e.target === e.currentTarget) setFocus({ i: lines.length - 1, pos: Infinity }) }}
        style={{ padding: '12px 16px', minHeight: 220, cursor: 'text' }}>
        {lines.map((l, i) => (
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
      <div style={{ borderTop: `0.5px solid ${C.sep}`, padding: '8px 12px', display: 'flex' }}>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={toggleChecklist} style={{
          ...plain, display: 'flex', alignItems: 'center', gap: 6, color: C.tint, fontSize: 14, fontWeight: 600, padding: '6px 8px', borderRadius: 8,
        }}><ListChecks size={18} />체크리스트</button>
      </div>
    </>
  )
}

function MemoTab({ memos, reload, setErr }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)

  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return memos
      .filter(m => !k || (m.title + ' ' + plainText(m.content)).toLowerCase().includes(k))
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
    const all = parseLines(joinText(m.title, m.content))
    const [first, ...rest] = all.map(l => l.text).filter(t => t.trim())
    const preview = rest.join(' ').trim()
    const checks = all.filter(l => l.check && l.text.trim()), doneN = checks.filter(l => l.done).length
    const due = m.due_date && dueLabel(m.due_date)
    return (
      <Row key={m.id} onClick={() => open(m)} last={i === arr.length - 1}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {m.color && m.color !== COLORS[0] && <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />}
            <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{first || '빈 메모'}</div>
          </div>
          <div style={{ fontSize: 14, color: C.sub, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {due && <span style={{ color: due[1], fontWeight: 600, marginRight: 8 }}>{due[0]}</span>}
            {checks.length > 0 && <span style={{ color: doneN === checks.length ? C.sub : C.tint, fontWeight: 600, marginRight: 8 }}>✓ {doneN}/{checks.length}</span>}
            {preview || shortStamp(m.updated_at)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap', alignSelf: 'flex-start', paddingTop: 3 }}>
          {preview && shortStamp(m.updated_at)}
        </div>
      </Row>
    )
  })

  return (
    <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, borderRadius: 12, padding: '10px 12px', marginBottom: 22, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <Search size={16} color={C.sub} strokeWidth={2.2} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`메모 ${memos.length}개에서 검색`} style={field} />
      </label>

      {list.length === 0 && <div style={{ textAlign: 'center', color: C.sub, padding: '60px 0', fontSize: 15 }}>{q ? '찾는 메모가 없어요' : '+ 버튼으로 첫 메모를 남겨보세요'}</div>}
      {pinned.length > 0 && <Group header={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Pin size={12} />고정됨</span>}>{renderRows(pinned)}</Group>}
      {others.length > 0 && <Group header={pinned.length > 0 ? '메모' : null}>{renderRows(others)}</Group>}

      <Fab label="새 메모" onClick={() => setEdit({ content: '', color: COLORS[0], pinned: false })} />

      {edit && (
        <Sheet title={edit.id ? '메모 편집' : '새 메모'} onCancel={() => setEdit(null)} onDone={save} onBackdrop={save}>
          <Group>
            <NoteEditor value={edit.content} onChange={content => setEdit(ed => ({ ...ed, content }))} autoFocus={!edit.id} />
          </Group>
          <Group>
            <Row>
              <span style={{ flex: 1, fontSize: 16 }}>마감일</span>
              <Toggle on={!!edit.due_date} onChange={on => setEdit({ ...edit, due_date: on ? todayStr() : '' })} />
            </Row>
            {edit.due_date && (
              <Row>
                <span style={{ flex: 1, fontSize: 16 }}>날짜</span>
                <input type="date" value={edit.due_date} onChange={e => setEdit({ ...edit, due_date: e.target.value })}
                  style={{ ...field, width: 'auto', background: C.fill, borderRadius: 6, padding: '6px 10px', color: C.tint }} />
              </Row>
            )}
            <Row>
              <span style={{ flex: 1, fontSize: 16 }}>고정</span>
              <Toggle on={!!edit.pinned} onChange={pinned => setEdit({ ...edit, pinned })} />
            </Row>
            <Row last>
              <span style={{ flex: 1, fontSize: 16 }}>색상</span>
              <ColorPicker value={edit.color} onChange={color => setEdit({ ...edit, color })} />
            </Row>
          </Group>
          {edit.id && (
            <Group>
              <Row last onClick={remove} style={{ justifyContent: 'center' }}>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 16, color: C.red }}>삭제</span>
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
  const chevron = { ...plain, color: C.sub, display: 'flex', padding: 6, borderRadius: 8 }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 2px 12px' }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 700 }}>{month.getFullYear()}년 {month.getMonth() + 1}월</div>
        <button aria-label="이전 달" style={chevron} onClick={() => moveMonth(-1)}><ChevronLeft size={22} /></button>
        <button onClick={goToday} style={{ ...plain, fontSize: 13, fontWeight: 600, color: C.tint, background: C.tintSoft, borderRadius: 999, padding: '6px 12px' }}>오늘</button>
        <button aria-label="다음 달" style={chevron} onClick={() => moveMonth(1)}><ChevronRight size={22} /></button>
      </div>

      <div style={{ background: C.card, borderRadius: 16, padding: '12px 6px 6px', marginBottom: 24, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)' }}>
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
                ...plain, height: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 3, visibility: inMonth ? 'visible' : 'hidden',
              }}>
                <span style={{
                  width: 34, height: 34, lineHeight: '34px', textAlign: 'center', borderRadius: 12, fontSize: 16,
                  fontWeight: isToday || isSel ? 700 : 400,
                  background: isSel ? C.tint : isToday ? C.tintSoft : 'transparent',
                  color: isSel ? '#fff' : isToday ? C.tint : weekend ? C.sub : C.text,
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
        {dayEvents.length === 0 && <Row last><span style={{ color: C.sub, fontSize: 15 }}>비어 있는 날이에요</span></Row>}
        {dayEvents.map((e, i) => <EventRow key={e.id} e={e} last={i === dayEvents.length - 1} onToggle={() => toggleDone(e)} onClick={() => open(e)} />)}
      </Group>

      {upcoming.length > 0 && (
        <Group header="다가오는 일정">
          {upcoming.map((e, i) => <EventRow key={e.id} e={e} showDate last={i === upcoming.length - 1} onToggle={() => toggleDone(e)} onClick={() => open(e)} />)}
        </Group>
      )}

      <Fab label="일정 추가" onClick={() => setEdit({ date: sel, time: '', text: '', color: COLORS[0], done: false })} />

      {edit && (
        <Sheet title={edit.id ? '일정 편집' : '새 일정'} onCancel={() => setEdit(null)} onDone={save} doneDisabled={!edit.text.trim()}>
          <Group>
            <textarea autoFocus value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} placeholder="무슨 일정인가요?" rows={3}
              style={{ ...field, display: 'block', padding: '12px 16px', resize: 'none', lineHeight: 1.4 }} />
          </Group>
          <Group>
            <Row>
              <span style={{ flex: 1, fontSize: 16 }}>날짜</span>
              <input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })}
                style={{ ...field, width: 'auto', background: C.fill, borderRadius: 6, padding: '6px 10px' }} />
            </Row>
            <Row>
              <span style={{ flex: 1, fontSize: 16 }}>하루 종일</span>
              <Toggle on={!edit.time} onChange={on => setEdit({ ...edit, time: on ? '' : '09:00' })} />
            </Row>
            {edit.time && (
              <Row>
                <span style={{ flex: 1, fontSize: 16 }}>시간</span>
                <input type="time" value={edit.time} onChange={e => setEdit({ ...edit, time: e.target.value })}
                  style={{ ...field, width: 'auto', background: C.fill, borderRadius: 6, padding: '6px 10px' }} />
              </Row>
            )}
            <Row last>
              <span style={{ flex: 1, fontSize: 16 }}>색상</span>
              <ColorPicker value={edit.color} onChange={color => setEdit({ ...edit, color })} />
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

function EventRow({ e, showDate, last, onToggle, onClick }) {
  const [first, ...rest] = joinText(e.title, e.memo).split('\n')
  return (
    <Row onClick={onClick} last={last}>
      <CheckCircle done={e.done} color={e.color} onClick={ev => { ev.stopPropagation(); onToggle() }} />
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: e.color, opacity: e.done ? 0.4 : 1 }} />
      <div style={{ flex: 1, minWidth: 0, opacity: e.done ? 0.45 : 1 }}>
        <div style={{ fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{first}</div>
        {rest.length > 0 && <div style={{ fontSize: 14, color: C.sub, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rest.join(' ')}</div>}
      </div>
      <div style={{ fontSize: 14, color: C.sub, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {showDate && <div>{new Date(e.date).getMonth() + 1}월 {new Date(e.date).getDate()}일</div>}
        <div>{e.time ? e.time.slice(0, 5) : (!showDate && '종일')}</div>
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
      <header style={{ maxWidth: 680, margin: '0 auto', padding: 'calc(16px + env(safe-area-inset-top)) 16px 8px' }}>
        <button onClick={() => navigate('/budget')} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 2, color: C.sub, fontSize: 13 }}>
          <ChevronLeft size={16} />가계부
        </button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 10 }}>
          {[['memo', '메모'], ['calendar', '일정']].map(([k, label]) => (
            <button key={k} onClick={() => switchTab(k)} style={{
              ...plain, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: tab === k ? C.text : C.faint, transition: 'color .15s',
            }}>{label}</button>
          ))}
        </div>
      </header>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '10px 16px calc(100px + env(safe-area-inset-bottom))' }}>
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
