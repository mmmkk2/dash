import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, MessageSquare, ChevronRight, DoorOpen, Trash2 } from 'lucide-react'
import { useShowTabBar } from '../src/TabBar'
import { Sheet, useBackClose } from '../notes-app'
import { supabase } from './login'
import { API, F, C, COL, GREEN, plain, won, Switch } from './anding-shared'
import { SettingsSheet, SmsToolSheet, SalarySheet } from './anding-tools'
import { ask, tell } from '../src/dialog'

// 앤딩 관리자 메인 — 내비서가 직접 그리는 화면.
// 숫자는 앤딩 앱(맥)의 /api/summary 에서 받고, 상세 표·그래프는 앤딩 앱 화면을 시트 안에 띄운다.
// /andingapp/* 는 vercel.json에서 앤딩 앱으로 중계되어 같은 주소라 로그인 쿠키가 그대로 실린다.
const man = n => n >= 10000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만` : won(n)
const hhmm = s => (s || '').match(/\d{2}:\d{2}/)?.[0] || ''

// 읽기는 Supabase(맥의 anding_dash_sync가 1분마다 올림)에서 먼저 — 맥이 꺼져 있어도 마지막 현황이 보인다.
// 없거나 못 읽으면(테이블 전, 권한 없음) 지금처럼 맥 앤딩 앱 API로
const syncKey = path => 'dash:' + path.replace(/^\/api\//, '').replace(/\?date=/, ':')
async function fromSync(path) {
  try {
    const { data, error } = await supabase.from('anding_dashboard').select('data').eq('key', syncKey(path)).maybeSingle()
    return error ? null : data?.data ?? null
  } catch { return null }
}
// 배치도 그림: Supabase 비공개 버킷의 서명 URL, 안 되면 맥 앤딩 앱 주소
// 서명 URL은 받을 때마다 주소가 달라 브라우저 캐시를 못 써서, 50분 동안 같은 주소를 재사용하고
// 그림이 바뀌면(ts) 뒤에 v=ts를 붙여 새로 받게 한다
const mapCache = new Map() // name → { ts, url, until }
async function mapUrl(name, ts) {
  const hit = mapCache.get(name)
  if (hit && hit.ts === ts && hit.until > Date.now()) return hit.url
  let url = `${API}/static/images/${name}?ts=${encodeURIComponent(ts || '')}`
  try {
    const { data } = await supabase.storage.from('anding').createSignedUrl(name, 3600)
    if (data?.signedUrl) url = `${data.signedUrl}&v=${encodeURIComponent(ts || '')}`
  } catch {}
  mapCache.set(name, { ts, url, until: Date.now() + 50 * 60e3 })
  return url
}
// 시트를 열기 전에 미리 받아 두기 (사물함 배치도가 늦게 뜨지 않게)
const preloadMap = (name, ts) => mapUrl(name, ts).then(u => { const img = new Image(); img.src = u })
function useMapUrl(name, ts) {
  const cached = mapCache.get(name)
  const [url, setUrl] = useState(cached && cached.ts === ts && cached.until > Date.now() ? cached.url : null)
  useEffect(() => { let alive = true; mapUrl(name, ts).then(u => alive && setUrl(u)); return () => { alive = false } }, [name, ts])
  return url
}

const tidyLockers = data => {
  // 사물함 번호가 '27번'처럼 와서 화면의 'N번'과 겹치지 않게 숫자만
  for (const k of ['expired', 'expiring']) for (const x of data.locker?.[k] || []) x.no = String(x.no ?? '').replace(/번$/, '')
  return data
}

// 맥 수집이 멈춰 있어도 날짜는 오늘 기준: 받은 요약을 지금 시각으로 다시 나눈다
// (스터디룸은 오늘 것만·이용 중 다시 계산, 사물함은 만료/오늘 만료 다시 분류, 지난 날 결제·지난 달 매출은 0)
// 스터디룸 예약 시각: 날짜까지 붙여 실제 시각(ms)으로 비교 — 자정을 넘는 예약(23:00–01:30)도
// 시작 전날 밤부터 끝나는 다음 날 새벽까지 '이용 중', 끝 시각이 지나야 '끝남'
const kstMs = (date, hm) => new Date(`${date.replace(/\./g, '-')}T${hm}:00+09:00`).getTime()
function roomSpan(date, start, endDate, end) {
  const s = kstMs(date, start)
  let e = kstMs(endDate || date, end)
  if (e < s) e += 864e5 // 끝 날짜가 없고 시각이 거꾸로면 다음 날
  return [s, e]
}
// 'YYYY.MM.DD HH:MM ~ YYYY.MM.DD HH:MM' (날짜 없으면 fallback 날짜)
function parseRoomTime(t, fallbackDate) {
  const [x, y] = (t || '').split('~').map(v => v.trim())
  const dateOf = v => (v.match(/\d{4}\.\d{2}\.\d{2}/) || [fallbackDate])[0]
  return { a: x.slice(-5), b: (y || '').slice(-5), span: roomSpan(dateOf(x), x.slice(-5), dateOf(y || ''), (y || '').slice(-5)) }
}

function freshen(d) {
  const now = new Date(), today = ymdDot(now)
  const dataDay = (d.now || '').slice(0, 10).replace(/-/g, '.')
  // 10분 넘게 새 요약이 없으면 맥 수집이 멈춘 것으로 본다 (평소엔 1분마다 올라옴)
  const stale = now - new Date((d.now || '').replace(' ', 'T') + '+09:00') > 10 * 60e3
  const endAt = r => new Date((r.end || '').replace(/\./g, '-').replace(' ', 'T') + ':00+09:00').getTime()
  const lockers = [...d.locker.expired, ...d.locker.expiring]
  const payDay = (d.payment.updated || '').slice(0, 10).replace(/-/g, '.')
  return {
    ...d, stale, today: now,
    studyroom: {
      ...d.studyroom,
      // 오늘 시작한 예약 + 어제 시작해 아직 안 끝난(자정 넘는) 예약
      items: d.studyroom.items.map(r => ({ r, span: roomSpan(r.date || dataDay, r.start, r.end_date, r.end) }))
        .filter(({ r, span }) => (r.date || dataDay) === today || (span[0] <= now.getTime() && now.getTime() <= span[1]))
        .map(({ r, span }) => ({ ...r, now: span[0] <= now.getTime() && now.getTime() <= span[1], done: span[1] < now.getTime() })),
    },
    locker: {
      ...d.locker,
      expired: lockers.filter(r => endAt(r) <= now.getTime()),
      expiring: lockers.filter(r => endAt(r) > now.getTime() && (r.end || '').slice(0, 10) === today),
    },
    payment: payDay && payDay !== today ? { ...d.payment, count: 0, amount: 0 } : d.payment,
    monthly: d.monthly.month !== now.getMonth() + 1 ? { month: now.getMonth() + 1, amount: 0, daily_avg: 0, predicted: 0 } : d.monthly,
  }
}

async function getSummary() {
  const synced = await fromSync('/api/summary')
  if (synced) return { data: tidyLockers(synced) }
  const r = await fetch(`${API}/api/summary`, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
  if (r.status === 401 || r.status === 403) return { login: true }
  // 404: 맥의 앤딩 앱이 아직 /api/summary가 없는 예전 코드 (자동 반영이 멈췄거나 재시작 전)
  if (r.status === 404) throw new Error('맥 앤딩 앱에 새 기능이 아직 반영되지 않았어요 (404)')
  if (!r.ok) throw new Error(`앤딩 서버 응답 ${r.status}`)
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('json')) return { login: true } // 로그인 화면으로 넘겨진 경우
  return { data: tidyLockers(await r.json()) }
}

function Login({ onDone }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API}/login`, { method: 'POST', credentials: 'same-origin', body: new URLSearchParams({ username: id, password: pw }) })
      if (!r.ok) throw new Error(r.status === 401 ? '아이디나 비밀번호가 맞지 않아요' : `로그인 실패 (${r.status})`)
      onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const field = { width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', fontSize: 16, padding: '13px 16px', fontFamily: F, background: 'none', color: C.text }
  return (
    <form onSubmit={submit} style={{ marginTop: 24 }}>
      <div style={{ fontSize: 15, color: C.sub, padding: '0 4px 10px' }}>앤딩 관리자 계정으로 로그인해 주세요</div>
      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}`, overflow: 'hidden' }}>
        <input value={id} onChange={e => setId(e.target.value)} placeholder="아이디" autoComplete="username" style={{ ...field, borderBottom: `0.5px solid ${C.sep}` }} />
        <input value={pw} onChange={e => setPw(e.target.value)} placeholder="비밀번호" type="password" autoComplete="current-password" style={field} />
      </div>
      {err && <div style={{ color: '#e5484d', fontSize: 14, padding: '10px 4px 0' }}>{err}</div>}
      <button disabled={busy || !id || !pw} style={{ ...plain, width: '100%', marginTop: 16, padding: '14px 0', borderRadius: 14, background: GREEN, color: '#fff', fontSize: 16, fontWeight: 600, opacity: busy || !id || !pw ? 0.5 : 1 }}>로그인</button>
    </form>
  )
}

// 메인 맨 위 간단 메모 (고정석 대기자 등). Supabase anding_memo 테이블에만 저장 (본인만, RLS)
function AndingMemo() {
  const [text, setText] = useState('')
  const [state, setState] = useState('loading') // loading | ok | saving | error | missing
  const [adding, setAdding] = useState(false) // 비어 있을 때 '+ 메모'를 눌러 쓰는 중
  const timer = useRef(null)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('anding_memo').select('content').maybeSingle()
      if (error) return setState(/anding_memo/.test(error.message) ? 'missing' : 'error')
      let content = data?.content || ''
      // 잠깐 급여표(anding_salary year=0)에 저장했던 메모가 있으면 옮기고 급여표에서는 지운다
      const { data: old } = await supabase.from('anding_salary').select('data').eq('year', 0).maybeSingle()
      if (old) {
        if (!content && old.data?.memo) {
          content = old.data.memo
          await supabase.from('anding_memo').upsert({ content, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        }
        await supabase.from('anding_salary').delete().eq('year', 0)
      }
      setText(content); setState('ok')
    })()
  }, [])
  const save = async value => {
    const { error } = await supabase.from('anding_memo').upsert({ content: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setState(error ? 'error' : 'ok')
  }
  const change = value => {
    setText(value); setState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save(value), 800)
  }
  const clear = async () => {
    if (!await ask('메모를 지울까요?')) return
    clearTimeout(timer.current); setText(''); setAdding(false); setState('saving'); save('')
  }
  if (state === 'loading') return null
  // 비어 있으면 카드 대신 작은 '+ 메모'만
  if (state !== 'missing' && !text && !adding) return (
    <button onClick={() => setAdding(true)} style={{ ...plain, display: 'block', marginTop: 12, padding: '2px 4px', fontSize: 13, fontWeight: 600, color: C.sub }}>+ 메모</button>
  )
  // '확인할 것'과 같은 모양: 위에 작은 제목, 카드 안은 한 줄 높이(내용만큼 늘어남)
  const card = { background: C.card, border: `0.5px solid ${C.sep}`, borderRadius: 16, padding: '11px 14px' }
  const status = state === 'saving' ? '저장 중…' : state === 'error' ? '저장 안 됨 (Supabase 연결 확인)' : ''
  return (
    <>
      <Label>
        <span style={{ display: 'flex', alignItems: 'center' }}>메모<span style={{ marginLeft: 'auto', fontWeight: 500, fontSize: 11.5, color: state === 'error' ? '#e5484d' : C.sub }}>{status}</span>
          {text && <button onClick={clear} aria-label="메모 지우기" style={{ ...plain, display: 'flex', color: C.sub, marginLeft: 8, padding: 2 }}><Trash2 size={14} /></button>}</span>
      </Label>
      {state === 'missing'
        ? <div style={{ ...card, fontSize: 13, color: C.sub }}>메모를 쓰려면 Supabase에 anding_memo 테이블을 만들어 주세요 (supabase_setup.sql 맨 아래)</div>
        : <div style={card}>
            <textarea autoFocus={adding && !text} value={text} onChange={e => change(e.target.value)} onBlur={() => { if (state === 'saving') { clearTimeout(timer.current); save(text) } if (!text) setAdding(false) }}
              placeholder="고정석 대기자 등 간단 메모" rows={Math.max(1, text.split('\n').length)}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'none', padding: 0, fontSize: 14.5, lineHeight: 1.45, fontFamily: F, color: C.text, background: 'transparent' }} />
          </div>}
    </>
  )
}

// 앤딩 방문 기록(⋯ 메뉴): 다녀온 날짜와 한 줄 메모 (Supabase anding_visits, 본인만)
const kDate = d => { const t = new Date(d + 'T00:00'); return `${t.getMonth() + 1}/${t.getDate()} (${'일월화수목금토'[t.getDay()]})` }
const todayKey = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` }
function VisitsSheet({ onClose }) {
  const [rows, setRows] = useState(null)
  const [missing, setMissing] = useState(false)
  const [edit, setEdit] = useState(null) // { id?, date, memo }
  useBackClose(!!edit, () => setEdit(null))
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('anding_visits').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })
    if (error) { setMissing(/anding_visits/.test(error.message)); return setRows([]) }
    setRows(data)
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    const row = { date: edit.date, memo: edit.memo.trim() }
    const { error } = edit.id ? await supabase.from('anding_visits').update(row).eq('id', edit.id) : await supabase.from('anding_visits').insert(row)
    if (error) return tell(error.message)
    setEdit(null); load()
  }
  async function remove() {
    if (!await ask('이 방문 기록을 삭제할까요?')) return
    const { error } = await supabase.from('anding_visits').delete().eq('id', edit.id)
    if (error) return tell(error.message)
    setEdit(null); load()
  }
  if (!rows) return null
  const card = { background: C.card, border: `0.5px solid ${C.sep}`, borderRadius: 16, overflow: 'hidden' }
  const ago = rows[0] && Math.round((new Date(todayKey() + 'T00:00') - new Date(rows[0].date + 'T00:00')) / 864e5)
  const row = (r, i) => (
    <button key={r.id} onClick={() => setEdit({ ...r, memo: r.memo || '' })} style={{ ...plain, display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 14.5, color: C.text }}>
      <span style={{ flexShrink: 0, fontWeight: 600, minWidth: 64 }}>{kDate(r.date)}</span>
      <span style={{ flex: 1, minWidth: 0, color: r.memo ? C.text : C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.memo || '메모 없음'}</span>
    </button>
  )
  const add = () => setEdit({ date: todayKey(), memo: '' })
  return (
    <>
      <Sheet title="방문 기록" tint={GREEN} doneLabel="닫기" hideCancel onDone={onClose} onBackdrop={onClose} inset
        actions={!missing && <button onClick={add} style={{ ...plain, fontSize: 14, fontWeight: 600, color: GREEN, padding: '6px 4px' }}>+ 기록</button>}>
        {ago != null && <div style={{ fontSize: 13, color: C.sub, padding: '0 4px 8px' }}>{ago === 0 ? '오늘 방문' : `마지막 방문 ${ago}일 전`} · 총 {rows.length}번</div>}
        {missing
          ? <div style={{ ...card, padding: '11px 14px', fontSize: 13, color: C.sub }}>방문 기록을 쓰려면 Supabase에 anding_visits 테이블을 만들어 주세요 (supabase_setup.sql 맨 아래)</div>
          : rows.length === 0
            ? <button onClick={add} style={{ ...plain, ...card, display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', fontSize: 14, color: C.sub }}>다녀온 날을 기록해 보세요</button>
            : <div style={card}>{rows.map(row)}</div>}
      </Sheet>
      {edit && (
        <Sheet title={edit.id ? '방문 기록' : '방문 기록 추가'} tint={GREEN} onCancel={() => setEdit(null)} onDone={save} doneDisabled={!edit.date}>
          <div style={{ ...card, display: 'flex', alignItems: 'center', padding: '10px 14px', marginBottom: 12 }}>
            <span style={{ flex: 1, fontSize: 15 }}>날짜</span>
            <input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} style={{ border: 'none', outline: 'none', background: C.fill, borderRadius: 6, padding: '6px 10px', fontSize: 15, fontFamily: F, color: C.text }} />
          </div>
          <div style={{ ...card, padding: '11px 14px' }}>
            <textarea autoFocus={!edit.id} value={edit.memo} onChange={e => setEdit({ ...edit, memo: e.target.value })} placeholder="한 일 · 확인한 것 (예: 에어컨 필터 청소, 사물함 3번 정리)" rows={4}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'none', padding: 0, fontSize: 15, lineHeight: 1.5, fontFamily: F, color: C.text, background: 'transparent' }} />
          </div>
          {edit.id && <button onClick={remove} style={{ ...plain, display: 'block', width: '100%', marginTop: 16, padding: 12, borderRadius: 14, background: C.card, border: `0.5px solid ${C.sep}`, color: '#e5484d', fontSize: 15 }}>삭제</button>}
        </Sheet>
      )}
    </>
  )
}

// 박스 8개 — 위 초록 카드(메인, 최대 3칸)와 아래 타일 어디에 둘지·숨길지는 ⋯ > 박스 배치
const BOX_NAME = { seat: '좌석', payment: '결제', monthly: '월 누적 매출', room: '스터디룸', locker: '사물함', product: '상품 판매', users: '이용자', cum: '누적 이용자' }
const DEFAULT_LAYOUT = { top: ['seat', 'payment', 'monthly'], bottom: ['room', 'locker', 'product', 'users', 'cum'] }
// 누르면 열 상세 창 (누적 이용자는 이용자 창)
const detailOf = k => k === 'cum' ? 'users' : k
const TOP_MAX = 3
// 박스마다 보일 값: label, value, unit, sub(한 줄 보조), alert(아래 타일에서 색 강조)
function boxInfo(k, d) {
  const s = d.seat
  if (k === 'seat') {
    const used = (s.used_free ?? 0) + (s.used_laptop ?? 0), total = (s.total_free ?? 0) + (s.total_laptop ?? 0)
    return { label: '잔여 좌석', value: s.remain ?? '-', sub: `사용 ${used}/${total}` }
  }
  if (k === 'payment') return { label: '결제', value: `${d.payment.count}건`, sub: `${hhmm(d.payment.updated)} 기준` }
  if (k === 'monthly') return { label: `${d.monthly.month}월 누적`, value: man(d.monthly.amount), sub: `예상 ${man(d.monthly.predicted)}` }
  if (k === 'room') {
    const rooms = d.studyroom.items.filter(r => !r.done)
    return { label: '스터디룸', value: `${rooms.length}건`, sub: rooms.length ? rooms.map(r => `${r.room} ${r.start}–${r.end}`).join(' · ') : '남은 예약 없음' }
  }
  if (k === 'locker') {
    const n = d.locker.expired.length + d.locker.expiring.length
    return { label: '사물함', value: d.locker.active ?? '-', unit: `/${d.locker.total}`, sub: n ? `만료 ${d.locker.expired.length} · 오늘 ${d.locker.expiring.length}` : '만료 없음', alert: !!n }
  }
  if (k === 'product') return { label: '상품 판매', value: d.product.mode, sub: `구매 ${d.product.buy}` }
  // 오늘 누적 이용자 (코보페이 '금일 이용자', 05시 기준)
  if (k === 'cum') return { label: '오늘 누적', value: `${s.today_users ?? '-'}명`, sub: `1회권 ${s.one_time ?? '-'}명` }
  // 기간권 등록 수와 오늘 이용자 수 — 눌러서 날짜별 추이
  return { label: '이용자', value: `기간권 ${s.period ?? '-'}명`, sub: `오늘 이용자 ${s.today_users ?? '-'}명 · 1회권 ${s.one_time ?? '-'}명` }
}

// 배치는 settings 표(anding_layout)에 — 기기끼리 같게. 먼저 이 기기에 둔 것으로 바로 그리고 받아서 맞춘다
const LAYOUT_KEY = 'anding_layout'
// seen: 저장할 때 있던 박스들 — 그 뒤에 새로 생긴 박스는 숨기지 않고 아래 맨 끝에 붙인다
const FIRST_BOXES = ['seat', 'payment', 'monthly', 'room', 'locker', 'product', 'users']
function cleanLayout(v) {
  if (!v) return DEFAULT_LAYOUT
  const ok = k => BOX_NAME[k]
  const top = (v.top || []).filter(ok).slice(0, TOP_MAX)
  const bottom = (v.bottom || []).filter(k => ok(k) && !top.includes(k))
  const seen = v.seen || FIRST_BOXES
  const fresh = Object.keys(BOX_NAME).filter(k => !seen.includes(k) && !top.includes(k) && !bottom.includes(k))
  return { top, bottom: [...bottom, ...fresh] }
}
function useLayout() {
  const [layout, setLayout] = useState(() => { try { return cleanLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY))) } catch { return DEFAULT_LAYOUT } })
  useEffect(() => {
    supabase.from('settings').select('value').eq('key', LAYOUT_KEY).maybeSingle().then(({ data }) => {
      if (!data?.value) return
      const v = cleanLayout(data.value)
      setLayout(v)
      try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(v)) } catch {}
    })
  }, [])
  const save = async v => {
    setLayout(v)
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(v)) } catch {}
    const { error } = await supabase.from('settings').upsert({ key: LAYOUT_KEY, value: { ...v, seen: Object.keys(BOX_NAME) } })
    if (error) tell('배치를 이 기기에만 저장했어요 (Supabase 저장 실패)')
  }
  return [layout, save]
}

// 위 카드의 칸도 누르면 해당 상세로 (아래 타일과 같은 창)
function Hero({ d, open, keys }) {
  // 칸마다 아래 한 줄 보조 정보
  const cell = k => {
    const b = boxInfo(k, d)
    return (
      <button key={k} onClick={() => open(detailOf(k))} style={{ ...plain, textAlign: 'left', color: '#fff', background: 'rgba(255,255,255,0.16)', borderRadius: 12, padding: '8px 10px', fontSize: 11.5, minWidth: 0 }}>
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.value}{b.unit && <span style={{ fontSize: 11.5, opacity: 0.8 }}>{b.unit}</span>}</div>
        <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.sub}</div>
      </button>
    )
  }
  const date = d.today
  return (
    <div style={{ borderRadius: 20, padding: '16px 18px', color: '#fff', background: `linear-gradient(135deg, ${GREEN}, #2f7d8f)` }}>
      <div style={{ fontSize: 12.5, opacity: 0.85, fontWeight: 600 }}>오늘 매출 · {date.getMonth() + 1}월 {date.getDate()}일</div>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', margin: keys.length ? '2px 0 10px' : '2px 0 0' }}>{won(d.payment.amount)}원</div>
      {keys.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${keys.length}, 1fr)`, gap: 6 }}>{keys.map(cell)}</div>}
    </div>
  )
}

const Label = ({ children }) => <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, padding: '0 4px 6px', marginTop: 14 }}>{children}</div>

// 문자 버튼 — 누르면 문구를 고르고 고쳐서 앤딩 서버(smsko)로 바로 보낸다
function SmsChip({ r, onSms }) {
  if (!r.hp) return null
  return (
    <button onClick={e => { e.stopPropagation(); onSms(r) }} aria-label={`${r.name || r.hp}에게 문자`} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: GREEN, background: GREEN + '14', borderRadius: 999, padding: '4px 9px', flexShrink: 0 }}>
      <MessageSquare size={12} />문자
    </button>
  )
}

// 만료된 내역만 종료 가능. 서버는 코보페이의 최신 만료일을 다시 확인한다.
const isLockerExpired = r => {
  const date = new Date((r.end || '').replace(/\./g, '-').replace(' ', 'T') + ':00+09:00')
  return Number.isFinite(date.getTime()) && date.getTime() <= Date.now()
}
// 만료된 사물함: '사물함 N번 리셋 봐주세요.' 문구를 클립보드에 복사 (카톡에 직접 붙여넣기)
function LockerResetCopyChip({ r }) {
  const [copied, setCopied] = useState(false)
  if (!isLockerExpired(r)) return null
  const number = String(r.no || '').replace(/번$/, '')
  const text = `사물함 ${number}번 리셋 봐주세요.`
  const copy = async e => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 클립보드 권한이 없을 때: 임시 입력칸으로 복사
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } finally { ta.remove() }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return <button onClick={copy} aria-label={`'${text}' 복사`} style={{ ...plain, fontSize: 12, fontWeight: 600, color: COL.locker, background: COL.locker + '14', borderRadius: 999, padding: '4px 9px', flexShrink: 0 }}>{copied ? '복사됨' : '리셋 요청'}</button>
}

function LockerEndChip({ r }) {
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  if (!isLockerExpired(r)) return null
  const end = async e => {
    e.stopPropagation()
    if (busy || !await ask(`사물함 ${r.no}번 · ${r.name || '미등록'}\n만료: ${r.end}\n\n이용을 종료해서 빈 사물함으로 바꿀까요?`)) return
    setBusy(true)
    try {
      const res = await fetch(`${API}/api/locker/end`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '종료 요청에 실패했어요')
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        const check = await fetch(`${API}/api/locker/end/${data.job}`, { credentials: 'same-origin' })
        const job = await check.json()
        if (!check.ok) throw new Error(job.error || '처리 상태를 확인하지 못했어요')
        if (job.status === 'done') {
          window.dispatchEvent(new Event('anding-locker-ended'))
          tell(job.message || '이용 종료 완료')
          return
        }
        if (job.status === 'error') throw new Error(job.message)
      }
      throw new Error('처리 시간이 길어지고 있어요. 다시 누르기 전에 현황을 새로고침해 주세요.')
    } catch (error) { tell(error.message || '종료 처리에 실패했어요') }
    finally { if (alive.current) setBusy(false) }
  }
  return <button onClick={end} disabled={busy} aria-label={`사물함 ${r.no}번 이용 종료`} style={{ ...plain, fontSize: 12, fontWeight: 600, color: COL.locker, background: COL.locker + '14', borderRadius: 999, padding: '4px 9px', flexShrink: 0, opacity: busy ? 0.6 : 1 }}>{busy ? '처리 중…' : '이용 종료'}</button>
}

// 문자 생성기(sms_generator.html)의 사물함 문구와 같게 ('오늘 만료' 안내는 알림톡이 자동으로 가서 문구 없음)
const CAFE = '앤딩스터디카페 상도점'
// 문자는 발신전용 번호라 답장 대신 카카오톡 채널로 문의받는다
const CONTACT = '\n\n문의: https://pf.kakao.com/_zxlbTn/chat\n(발신전용번호, 문의는 카카오톡)'
const who = n => n ? `${n} 회원님` : '회원님'
const SMS_TEMPLATES = {
  expired: { label: '만료', make: r => `[${CAFE}]\n${who(r.name)}, 이용 중이신 사물함의 사용 기간이 만료되었습니다.\n이용을 계속 원하신다면 키오스크 또는 앱에서 연장 결제를 진행해 주세요.\n금일까지 연장이 완료되지 않으면 사물함 이용이 종료될 수 있습니다.\n감사합니다.${CONTACT}` },
  cleared: { label: '종료·짐보관', make: r => `[${CAFE}]\n안녕하세요, ${who(r.name)}.\n사물함 결제가 진행되지 않아 이용이 종료되었습니다.\n\n내부 짐은 휴게실 옷걸이 아래에 보관 중이니, 빠른 시일 내에 찾아가 주시기 바랍니다.\n\n미수령 시 발생하는 분실에 대해서는 책임을 지지 않는 점 양해 부탁드립니다.\n감사합니다.${CONTACT}` },
}
const bytes = t => [...t].reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)

function SmsSheet({ r, onClose }) {
  const [kind, setKind] = useState(r.kind)
  const [text, setText] = useState(() => SMS_TEMPLATES[r.kind].make(r))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useBackClose(true, onClose)
  const pick = k => { setKind(k); setText(SMS_TEMPLATES[k].make(r)) }
  const n = bytes(text)
  async function send() {
    if (!await ask(`${r.name || ''} ${r.hp}\n이 번호로 문자를 보낼까요?`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`${API}/api/sms/send`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ phone: r.hp, text, category: 'info' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || `발송 실패 (${res.status})`)
      setMsg({ ok: true, text: '보냈어요' })
      setTimeout(onClose, 900)
    } catch (e) { setMsg({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <Sheet title="문자 보내기" tint={GREEN} doneLabel={busy ? '보내는 중…' : '보내기'} doneDisabled={busy || !text.trim()} onDone={send} onCancel={onClose}>
      <div style={{ fontSize: 15, padding: '0 4px 10px' }}>{r.no && <b style={{ fontWeight: 600 }}>사물함 {r.no}번 </b>}{r.name || '미등록'} <span style={{ color: C.sub }}>{r.hp}</span></div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {Object.entries(SMS_TEMPLATES).map(([k, t]) => (
          <button key={k} onClick={() => pick(k)} aria-pressed={kind === k} style={{ ...plain, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 10px', background: kind === k ? GREEN : C.card, color: kind === k ? '#fff' : GREEN, border: `0.5px solid ${kind === k ? GREEN : C.sep}` }}>{t.label}</button>
        ))}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', minHeight: 230, resize: 'vertical', border: `0.5px solid ${C.sep}`, borderRadius: 16, padding: '12px 14px', fontSize: 15, lineHeight: 1.5, fontFamily: F, color: C.text, background: C.card, outline: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.sub, padding: '6px 4px 0' }}>
        <span>{n > 90 ? '장문(LMS)' : '단문(SMS)'} · {n}바이트</span>
        {msg && <span style={{ color: msg.ok ? GREEN : '#e5484d', fontWeight: 600 }}>{msg.text}</span>}
      </div>
    </Sheet>
  )
}

// 고정석 이용권이 3일 안에 끝나는 자리 (날짜 기준 D-day, 끝나는 순)
function fixedExpiring(all) {
  const now = Date.now(), today = new Date(new Date().toDateString()).getTime()
  return (all || []).filter(r => r.end).map(r => {
    const end = new Date(r.end.replace(/\./g, '-').replace(' ', 'T') + ':00+09:00').getTime()
    const day = new Date(r.end.slice(0, 10).replace(/\./g, '-') + 'T00:00:00+09:00').getTime()
    return { ...r, endMs: end, days: Math.round((day - today) / 864e5) }
  }).filter(r => r.endMs > now && r.days <= 3).sort((a, b) => a.endMs - b.endMs)
}

// 처리할 것: 사물함 만료완료·만료예정, 지금 이용 중인 스터디룸
function Todo({ d, onSms, open }) {
  const rows = [
    // 빈 고정석은 맨 위 (배치도에서 흰 칸 = 이용권 없는 자리, 새 고정석 손님을 받을 수 있음). 오른쪽은 마지막 이용자
    ...(d.seat.fixed_ended || []).map(r => ({ k: 'seat', c: COL.seat, text: <>고정석 {r.no}번 <b style={{ fontWeight: 600 }}>빈 자리</b></>, right: r.end ? `${r.name || ''} ~${r.end.slice(5, 10).replace('.', '/')}`.trim() : '' })),
    // 고정석 이용권 만료 예정 (3일 안, 아직 안 끝난 것). 끝난 자리는 위 '빈 자리'로
    ...fixedExpiring(d.seat.fixed_all).map(r => ({ k: 'seat', c: COL.seat, text: <>고정석 {r.no}번 {r.name || '미등록'} <b style={{ fontWeight: 600 }}>{r.days === 0 ? '오늘 만료' : `만료 D-${r.days}`}</b></>, right: `${r.end.slice(5, 10).replace('.', '/')} ${hhmm(r.end)}` })),
    ...d.locker.expired.map(r => ({ k: 'locker', c: COL.locker, text: <>사물함 {r.no}번 {r.name || '미등록'} <b style={{ fontWeight: 600 }}>만료됨</b></>, right: r.end.slice(5, 10).replace('.', '/'), sms: { ...r, kind: 'expired' } })),
    ...d.locker.expiring.map(r => ({ k: 'locker', c: COL.locker, text: <>사물함 {r.no}번 {r.name || '미등록'} <b style={{ fontWeight: 600 }}>오늘 만료</b></>, right: hhmm(r.end), sms: { ...r, kind: 'expired' } })),
    ...d.studyroom.items.filter(r => r.now).map(r => ({ k: 'room', c: COL.room, text: <>스터디룸 {r.room} <b style={{ fontWeight: 700 }}>{r.name}</b> 이용 중</>, right: `~${r.end}` })),
  ]
  if (!rows.length) return null
  return (
    <>
      <Label>확인할 것 {rows.length}</Label>
      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}` }}>
        {rows.map((r, i) => (
          // 줄을 누르면 해당 상세(좌석·사물함·스터디룸) 창 — 문자·리셋·종료 버튼은 따로
          <div key={i} role="button" tabIndex={0} onClick={() => open(r.k)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 14.5, cursor: 'pointer' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.c, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text}</div>
            <span style={{ color: C.sub, fontSize: 12 }}>{r.right}</span>
            {r.sms && <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5, maxWidth: 210 }}><SmsChip r={r.sms} onSms={onSms} /><LockerResetCopyChip r={r.sms} /><LockerEndChip r={r.sms} /></div>}
          </div>
        ))}
      </div>
    </>
  )
}

function Tile({ color, title, value, unit, sub, bar, onClick, wide }) {
  return (
    <button onClick={onClick} style={{ ...plain, textAlign: 'left', background: C.card, border: `0.5px solid ${C.sep}`, borderRadius: 16, padding: '12px 13px', minHeight: 108, display: 'flex', flexDirection: 'column', color: C.text, minWidth: 0, ...(wide && { gridColumn: '1 / -1', minHeight: 0 }) }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{title}
        <ChevronRight size={14} color="#c7c7cc" style={{ marginLeft: 'auto' }} />
      </div>
      <div style={{ fontSize: 21, fontWeight: 700, marginTop: 8, letterSpacing: '-0.02em' }}>
        {value}{unit && <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>{unit}</span>}
      </div>
      {bar != null && <div style={{ height: 5, borderRadius: 9, background: '#eee', marginTop: 7, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, bar)}%`, height: '100%', background: color, borderRadius: 9 }} /></div>}
      <div style={{ fontSize: 12, color: C.sub, marginTop: 'auto', paddingTop: 6, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{sub}</div>
    </button>
  )
}

function Tiles({ d, open, keys }) {
  if (!keys.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
      {keys.map(k => {
        const b = boxInfo(k, d)
        return <Tile key={k} color={COL[k]} title={BOX_NAME[k]} value={b.value} unit={b.unit}
          sub={b.alert ? <span style={{ color: COL[k], fontWeight: 600 }}>{b.sub}</span> : b.sub} onClick={() => open(detailOf(k))} />
      })}
    </div>
  )
}

// 박스 배치 (⋯ 메뉴): 화면 모양 그대로 작게 그려 두고 박스를 끌어서 옮긴다
// 초록 카드(메인, 최대 3칸) ↔ 아래 박스 ↔ 숨김. 숨김 박스는 눌러도 아래에 붙고, 보이는 박스의 ×는 숨김으로
function LayoutSheet({ layout, onSave, onClose }) {
  const [v, setV] = useState(layout)
  const [drag, setDrag] = useState(null) // { k, x, y, dx, dy, w, h }
  const els = useRef({}), zones = useRef({}), start = useRef(null), vRef = useRef(v)
  vRef.current = v
  useBackClose(true, onClose)
  const hidden = Object.keys(BOX_NAME).filter(k => !v.top.includes(k) && !v.bottom.includes(k))

  // k를 zone의 idx 자리에 넣기. 메인이 넘치면 마지막 칸은 아래 맨 앞으로
  const place = (cur, k, zone, idx) => {
    let top = cur.top.filter(x => x !== k), bottom = cur.bottom.filter(x => x !== k)
    if (zone === 'top') top.splice(idx, 0, k)
    if (zone === 'bottom') bottom.splice(idx, 0, k)
    if (top.length > TOP_MAX) bottom = [...top.splice(TOP_MAX), ...bottom]
    return { top, bottom }
  }
  // 손가락이 어느 칸 위에 있는지: 구역을 찾고, 그 안에서 앞에 있는 박스 수 = 넣을 자리
  const target = (k, x, y) => {
    const inside = z => { const r = zones.current[z]?.getBoundingClientRect(); return r && y >= r.top - 12 && y <= r.bottom + 12 && x >= r.left - 12 && x <= r.right + 12 }
    const zone = ['top', 'bottom', 'hidden'].find(inside)
    if (!zone) return null
    if (zone === 'hidden') return { zone, idx: 0 }
    const idx = vRef.current[zone].filter(x2 => x2 !== k).filter(o => {
      const r = els.current[o]?.getBoundingClientRect()
      if (!r) return false
      if (r.bottom < y) return true
      if (r.top > y) return false
      return r.left + r.width / 2 < x
    }).length
    return { zone, idx }
  }

  // 박스가 메인↔아래로 넘어가면 다시 그려지므로 움직임은 창 전체(window)에서 받는다
  const down = (k, e) => {
    const r = e.currentTarget.getBoundingClientRect()
    start.current = { k, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, moved: false }
    const move = ev => {
      const s = start.current
      if (!s.moved && Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) < 6) return
      s.moved = true
      setDrag({ k, x: ev.clientX, y: ev.clientY, dx: s.dx, dy: s.dy, w: s.w, h: s.h })
      const t = target(k, ev.clientX, ev.clientY)
      if (t) setV(cur => place(cur, k, t.zone, t.idx))
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      const s = start.current
      start.current = null; setDrag(null)
      // 끌지 않고 누르기만: 숨김 박스는 아래 맨 끝으로
      if (!s.moved) setV(cur => cur.top.includes(k) || cur.bottom.includes(k) ? cur : place(cur, k, 'bottom', cur.bottom.length))
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  const box = (k, kind) => {
    const on = kind !== 'hidden', isTop = kind === 'top', ghost = drag?.k === k
    return (
      <div key={k} ref={el => { els.current[k] = el }} onPointerDown={e => down(k, e)}
        style={{
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'grab', position: 'relative', minWidth: 0, opacity: ghost ? 0.3 : 1,
          display: 'flex', alignItems: 'center', gap: 6, fontSize: isTop ? 12.5 : 14, fontWeight: 600,
          ...(isTop ? { background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 12, padding: '14px 10px' }
            : kind === 'bottom' ? { background: C.card, color: C.text, border: `0.5px solid ${C.sep}`, borderRadius: 16, padding: '18px 12px' }
            : { background: C.card, color: C.sub, border: `0.5px dashed ${C.sep}`, borderRadius: 999, padding: '6px 12px 6px 10px', fontSize: 13 }),
        }}>
        {!isTop && <span style={{ width: 8, height: 8, borderRadius: '50%', background: COL[k], flexShrink: 0 }} />}
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{!on && '+ '}{BOX_NAME[k]}</span>
        {on && <button onPointerDown={e => e.stopPropagation()} onClick={() => setV(cur => place(cur, k, 'hidden'))} aria-label={`${BOX_NAME[k]} 빼기`}
          style={{ ...plain, position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#8e8e93', color: '#fff', fontSize: 13, lineHeight: '20px', textAlign: 'center' }}>×</button>}
      </div>
    )
  }
  const hint = t => <div style={{ fontSize: 12.5, opacity: 0.75, padding: '12px 4px', textAlign: 'center' }}>{t}</div>
  return (
    <Sheet title="박스 배치" tint={GREEN} onCancel={onClose} onDone={() => { onSave(v); onClose() }}>
      <div style={{ fontSize: 13, color: C.sub, padding: '0 4px 10px' }}>박스를 끌어서 옮기고, ×로 빼요</div>
      <div ref={el => { zones.current.top = el }} style={{ borderRadius: 20, padding: '14px 14px', color: '#fff', background: `linear-gradient(135deg, ${GREEN}, #2f7d8f)` }}>
        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600, marginBottom: 8 }}>메인 · 최대 {TOP_MAX}칸</div>
        {v.top.length
          ? <div style={{ display: 'grid', gridTemplateColumns: `repeat(${v.top.length}, 1fr)`, gap: 6 }}>{v.top.map(k => box(k, 'top'))}</div>
          : hint('여기로 끌어 오기')}
      </div>
      <Label>아래 박스</Label>
      <div ref={el => { zones.current.bottom = el }} style={{ minHeight: 56 }}>
        {v.bottom.length
          ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{v.bottom.map(k => box(k, 'bottom'))}</div>
          : <div style={{ border: `0.5px dashed ${C.sep}`, borderRadius: 16, color: C.sub }}>{hint('여기로 끌어 오기')}</div>}
      </div>
      <Label>숨김</Label>
      <div ref={el => { zones.current.hidden = el }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 34, padding: 2 }}>
        {hidden.length ? hidden.map(k => box(k, 'hidden')) : <div style={{ fontSize: 13, color: C.sub, padding: '6px 2px' }}>없음 — 여기로 끌면 숨겨요</div>}
      </div>
      <button onClick={() => setV(DEFAULT_LAYOUT)} style={{ ...plain, display: 'block', margin: '20px auto 0', fontSize: 13.5, fontWeight: 600, color: C.sub }}>처음 배치로</button>
      {/* 끌고 있는 박스: 손가락을 따라다니는 복사본 */}
      {drag && (
        <div style={{ position: 'fixed', left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w, height: drag.h, zIndex: 60, pointerEvents: 'none', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', fontSize: 14, fontWeight: 600, color: C.text, background: C.card, borderRadius: 14,
          boxShadow: '0 10px 28px rgba(0,0,0,0.22)', transform: 'scale(1.04)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: COL[drag.k], flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{BOX_NAME[drag.k]}</span>
        </div>
      )}
    </Sheet>
  )
}

// 상세: 앤딩 앱의 표·그래프 화면을 그대로 (테마는 앤딩 쪽 naebiseo_theme가 입힘)
const DETAIL = {
  seat: { title: '좌석', path: '/seat' },
  payment: { title: '결제', path: '/payment' },
  room: { title: '스터디룸', path: '/room' },
  product: { title: '상품', path: '/product' },
  monthly: { title: '월별 매출', path: '/monthly' },
  locker: { title: '사물함' },
  users: { title: '이용자 · 기간권' },
}

// 사물함 배치도: 앤딩 사물함 수집이 코보페이 '사물함 배치도'를 찍어 둔 그림 (아직 없으면 안 보임)
function LockerMap({ ts }) {
  const [ok, setOk] = useState(true)
  const url = useMapUrl('locker_map.png', ts)
  if (!ok || !url) return null
  return (
    <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}`, overflow: 'hidden', marginTop: 10 }}>
      <img src={url} alt="사물함 배치도" onError={() => setOk(false)} style={{ display: 'block', width: '100%' }} />
    </div>
  )
}

function LockerList({ d, onSms }) {
  const group = (title, rows, kind) => rows.length > 0 && (
    <>
      <Label>{title} {rows.length}</Label>
      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}` }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 15 }}>
            <b style={{ fontWeight: 600, minWidth: 36 }}>{r.no}번</b>
            <div style={{ flex: 1, minWidth: 0 }}>{r.name || '미등록'}<div style={{ fontSize: 12, color: C.sub }}>{r.end}</div></div>
            <SmsChip r={{ ...r, kind }} onSms={onSms} />
            <LockerResetCopyChip r={r} />
            <LockerEndChip r={r} />
          </div>
        ))}
      </div>
    </>
  )
  return (
    <div>
      <div style={{ fontSize: 15, color: C.sub, padding: '0 4px' }}>이용 중 {d.locker.active ?? '-'}개 · 빈 사물함 {d.locker.active != null ? d.locker.total - d.locker.active : '-'}개</div>
      <LockerMap ts={d.locker.updated} />
      {group('만료완료', d.locker.expired, 'expired')}
      {group('오늘 만료', d.locker.expiring, 'expired')}
      {!d.locker.expired.length && !d.locker.expiring.length && <div style={{ textAlign: 'center', color: C.sub, padding: '40px 0' }}>만료된 사물함이 없어요</div>}
      <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 14 }}>Updated {d.locker.updated}</div>
    </div>
  )
}

// 앤딩 앱 JSON API 읽기 (관리자 세션 쿠키 그대로)
// 상세 데이터: 받은 것은 기억해 두고 다시 열 때 바로 보여준 뒤 새로 받는다
const apiCache = new Map()
async function loadApi(path) {
  const synced = await fromSync(path)
  if (synced) { apiCache.set(path, synced); return { data: synced } }
  const r = await fetch(API + path, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
  const body = await r.json().catch(() => null)
  if (r.status === 200 && body) { apiCache.set(path, body); return { data: body } }
  return { status: r.status, error: body?.error || `불러오기 실패 (${r.status})` }
}
function useApi(path) {
  const [st, setSt] = useState(() => apiCache.has(path) ? { data: apiCache.get(path) } : { loading: true })
  useEffect(() => {
    let alive = true
    setSt(o => ({ ...o, loading: true }))
    loadApi(path).then(r => alive && setSt(r)).catch(e => alive && setSt({ error: e.message }))
    return () => { alive = false }
  }, [path])
  return st
}

// 아직 내비서로 옮기지 않은 상세(또는 새 API가 맥에 반영되기 전): 앤딩 상세 화면을 그대로
function IframeDetail({ k, path }) {
  const [loaded, setLoaded] = useState(false)
  // 앤딩 상세 화면이 카드 안에 들어간 것처럼 보이게 (흰 바탕·작은 제목·카드 색) — 같은 주소라 직접 표시를 단다
  const onLoad = e => {
    try {
      const doc = e.target.contentDocument
      doc.documentElement.setAttribute('data-nested', '')
      doc.documentElement.style.setProperty('--nb-accent', COL[k])
    } catch {}
    setLoaded(true)
  }
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `0.5px solid ${C.sep}`, overflow: 'hidden', padding: '8px 6px' }}>
      {!loaded && <div style={{ textAlign: 'center', color: C.sub, padding: '40px 0' }}>불러오는 중…</div>}
      <iframe title={k} src={API + path} onLoad={onLoad} style={{ border: 0, width: '100%', height: 'calc(78dvh - 130px - env(safe-area-inset-bottom))', display: 'block' }} />
    </div>
  )
}

const Card = ({ children, style }) => <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}`, overflow: 'hidden', ...style }}>{children}</div>
const Muted = ({ children }) => <div style={{ textAlign: 'center', color: C.sub, padding: '40px 0', fontSize: 15 }}>{children}</div>
const t2m = s => { const d = new Date(s); return d.getHours() * 60 + d.getMinutes() } // 'YYYY-MM-DDTHH:MM:SS' → 분
const shortTime = s => (s || '').replace(/^\d{4}\./, '').replace(/\./g, '/').replace(/^(\d\d\/\d\d) /, '$1 ')

// 오늘(05시~다음날 05시) 자유석 이용자 수 그래프
function SeatChart({ d, H = 130 }) {
  const W = 340, L = 26, B = 18
  const start = new Date(d.start).getTime(), span = new Date(d.end).getTime() - start
  const max = Math.max(d.total_free || 0, ...d.history.map(h => h[1]), 1)
  const x = t => L + (new Date(t).getTime() - start) / span * (W - L - 4)
  const y = v => 6 + (1 - v / max) * (H - B - 6)
  const pts = d.history.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`)
  const limit = d.total_free - d.danger
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="오늘 자유석 이용자 수">
      {[0, Math.round(max / 2), max].map(v => (
        <g key={v}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} stroke={C.sep} /><text x={L - 4} y={y(v) + 3} fontSize="9" fill={C.sub} textAnchor="end">{v}</text></g>
      ))}
      {limit > 0 && <line x1={L} x2={W - 4} y1={y(limit)} y2={y(limit)} stroke="#e5484d" strokeDasharray="3 3" opacity=".6" />}
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => {
        const xx = L + h / 24 * (W - L - 4)
        return <text key={h} x={xx} y={H - 4} fontSize="9" fill={C.sub} textAnchor="middle">{String((5 + h) % 24).padStart(2, '0')}</text>
      })}
      {pts.length > 1 && <path d={`M${pts[0].split(',')[0]},${y(0)} L${pts.join(' L')} L${pts[pts.length - 1].split(',')[0]},${y(0)} Z`} fill={COL.seat + '22'} />}
      {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke={COL.seat} strokeWidth="1.8" strokeLinejoin="round" />}
    </svg>
  )
}

// 고정석 전체 목록: 자리마다 마지막 이용권(fixed_all) + 지금 입실 기록 중 더 늦게 끝나는 것. 자리 번호 순
function fixedRows(d, now, parse) {
  const by = {}
  for (const r of d.fixed_all || []) by[r.no] = { seat: String(r.no), name: r.name, product: r.product, end: r.end }
  for (const r of d.seats['고정석'] || []) {
    const k = Number(r.seat)
    // fixed_all이 있으면 그 자리만 (맥에서 뺀 자리 — 예: 39번 — 는 입실 기록이 있어도 숨김)
    if (Number.isNaN(k) || (d.fixed_all?.length && !by[k])) continue
    if (!by[k] || (r.end || '') > (by[k].end || '')) by[k] = { seat: String(r.seat), name: r.name, product: r.product, end: r.end }
  }
  return Object.keys(by).sort((a, b) => a - b).map(k => ({ ...by[k], over: !by[k].end || parse(by[k].end) <= now }))
}

// 좌석 상세: 위에 요약·그래프, 아래는 칩으로 하나씩 (배치도 / 곧 종료 / 자유석 / 노트북석 / 고정석) — 세로로 길게 늘어지지 않게
function SeatDetail() {
  const { data: d, status, error, loading } = useApi('/api/seat_detail')
  const seatMap = useMapUrl('seat_map.png', d?.updated)
  const [view, setView] = useState('soon')
  const [mapFailed, setMapFailed] = useState(false)
  if (status === 404) return <IframeDetail k="seat" path="/seat" />
  if (error) return <Muted>{error}</Muted>
  if (loading && !d) return <Muted>불러오는 중…</Muted>
  const now = Date.now()
  const parse = s => new Date((s || '').replace(/\./g, '-').replace(' ', 'T')).getTime()
  const soon = (d.seats['자유석'] || []).filter(r => { const e = parse(r.end); return e >= now && e - now <= 6 * 3600e3 }).sort((a, b) => parse(a.end) - parse(b.end))
  const views = [
    ['soon', '곧 종료', soon, true],
    ['free', '자유석', d.seats['자유석'] || []],
    ['laptop', '노트북석', d.seats['노트북석'] || []],
    ['fixed', '고정석', fixedRows(d, now, parse), 'fixed'],
  ]
  const cur = views.find(v => v[0] === view) || views[0]
  // 한 사람 한 줄: 좌석 · 이름 · 상품 · 시각
  const list = (rows, end) => rows.length === 0 ? <Muted>없어요</Muted> : end === 'fixed' ? (
    // 고정석: 자리마다 이용권 종류와 종료 시각(날짜까지). 이용권이 끝난 자리는 흐리게 '빈 자리'
    <Card>
      {rows.map((r, i) => (
        <div key={r.seat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 14, whiteSpace: 'nowrap', opacity: r.over ? 0.5 : 1 }}>
          <b style={{ fontWeight: 600, minWidth: 24, color: COL.seat }}>{r.seat}</b>
          <span style={{ flexShrink: 0 }}>{r.over ? '빈 자리' : (r.name || '미등록')}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.over ? (r.name ? `${r.name} · ${r.product || ''}` : '') : (r.product || '')}</span>
          <span style={{ fontSize: 12, color: C.sub }}>{r.end ? `~${shortTime(r.end)}` : ''}</span>
        </div>
      ))}
    </Card>
  ) : (
    <Card>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 14, whiteSpace: 'nowrap' }}>
          <b style={{ fontWeight: 600, minWidth: 24, color: COL.seat }}>{r.seat}</b>
          <span style={{ flexShrink: 0 }}>{r.name || '미등록'}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.product}</span>
          <span style={{ fontSize: 12, color: C.sub }}>{end ? `~${shortTime(r.end)}` : `${hhmm(r.start)} 입실`}</span>
        </div>
      ))}
    </Card>
  )
  return (
    <div>
      {/* 위: 요약 + 배치도. 목록을 내려도 위에 고정 (시간대별 그래프는 이용자 창으로) */}
      <div style={{ position: 'sticky', top: 64, zIndex: 1, background: C.bg }}>
      <div style={{ fontSize: 14, color: C.sub, padding: '0 4px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>자유 {d.used_free}/{d.total_free} · 잔여 {d.remaining} · 노트북 {d.used_laptop}/{d.total_laptop}</div>
      <Card style={{ aspectRatio: '16 / 10', width: '84%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(seatMap && !mapFailed && { background: '#2b2b2b' }) }}>
        {seatMap && !mapFailed
          ? <img src={seatMap} alt="좌석 배치도" onError={() => setMapFailed(true)} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
          : <div style={{ fontSize: 13, color: C.sub }}>배치도가 아직 없어요</div>}
      </Card>
      <div style={{ display: 'flex', gap: 6, padding: '10px 0 8px', overflowX: 'auto' }}>
        {views.map(([k, label, rows]) => (
          <button key={k} onClick={() => setView(k)} aria-pressed={view === k} style={{ ...plain, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap', background: view === k ? COL.seat : C.card, color: view === k ? '#fff' : COL.seat, border: `0.5px solid ${view === k ? COL.seat : C.sep}` }}>
            {label}{k === 'fixed' ? ` ${rows.filter(r => !r.over).length}/${rows.length}` : rows ? ` ${rows.length}` : ''}
          </button>
        ))}
      </div>
      </div>
      <div key={view}>{list(cur[2], cur[3])}</div>
      <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 12 }}>Updated {d.updated}</div>
    </div>
  )
}

const ymdDot = dt => `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`

function PaymentDetail() {
  const today = ymdDot(new Date())
  const yesterday = ymdDot(new Date(Date.now() - 864e5))
  const [date, setDate] = useState(today)
  const { data: d, status, error, loading } = useApi(`/api/payments?date=${date}`)
  if (status === 404 && !d) return <IframeDetail k="payment" path="/payment" />
  const navBtn = (label, to, disabled) => (
    <button onClick={() => setDate(to)} disabled={disabled} aria-label={label} style={{ ...plain, width: 34, height: 34, borderRadius: 10, background: C.card, border: `0.5px solid ${C.sep}`, color: disabled ? C.sep : C.text, fontSize: 17 }}>{label === '이전 날' ? '‹' : '›'}</button>
  )
  return (
    <div>
      {/* 이전 결제는 어제(D-1)까지만 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {navBtn('이전 날', yesterday, date === yesterday)}
        <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600 }}>{date}{date === today ? ' (오늘)' : ' (어제)'}</div>
        {navBtn('다음 날', today, date === today)}
      </div>
      {error && <Muted>{error}</Muted>}
      {!error && loading && !d && <Muted>불러오는 중…</Muted>}
      {d && (
        <>
          <div style={{ fontSize: 15, color: C.sub, padding: '0 4px 8px' }}>승인 {d.count}건 · <b style={{ color: COL.payment }}>{won(d.amount)}원</b></div>
          {d.rows.length === 0 ? <Muted>결제 내역이 없어요</Muted> : (
            <Card>
              {d.rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 14.5, opacity: r.paid ? 1 : 0.45 }}>
                  <span style={{ fontSize: 12.5, color: C.sub, minWidth: 38 }}>{r.time}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {r.user || '-'}
                    <div style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.product}{!r.paid && r.status ? ` · ${r.status}` : ''}</div>
                  </div>
                  <b style={{ fontWeight: 600, whiteSpace: 'nowrap', textDecoration: r.paid ? 'none' : 'line-through' }}>{won(r.amount)}원</b>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// 스터디룸: 오늘~모레, 날짜 칩으로 바꿔 보고 2인실·4인실 나란히
function RoomDetail() {
  const { data, status, error, loading } = useApi('/api/room_detail')
  const [day, setDay] = useState(0)
  if (status === 404 || (data && !data.days)) return <IframeDetail k="room" path="/room" />
  if (error) return <Muted>{error}</Muted>
  if (loading && !data) return <Muted>불러오는 중…</Muted>
  // 날짜는 맥 수집 시점이 아니라 오늘 기준 (맥이 멈춰 있어도 오늘·내일·모레). 수집에 없는 날은 빈 칸
  const days = [0, 1, 2].map(o => {
    const t = new Date(Date.now() + o * 864e5), date = ymdDot(t)
    const label = `${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')} (${'일월화수목금토'[t.getDay()]})`
    return { ...(data.days.find(x => x.date === date) || { missing: true, count_2: 0, count_4: 0 }), date, label }
  })
  // 오늘 칸에는 전날 시작해 아직 이용 중인(자정 넘는) 예약도 맨 위에
  const t0 = Date.now()
  for (const k of ['reservations_2', 'reservations_4']) {
    const carry = data.days.filter(x => x.date < days[0].date).flatMap(x => (x[k] || []).map(r => ({ ...r, _date: x.date })))
      .filter(r => { const { span } = parseRoomTime(r.time, r._date); return span[0] <= t0 && t0 <= span[1] })
    const have = days[0][k] || []
    days[0] = { ...days[0], missing: days[0].missing && !carry.length, [k]: [...carry.filter(c => !have.some(h => h.time === c.time && h.name === c.name)), ...have] }
  }
  days[0] = { ...days[0], count_2: (days[0].reservations_2 || []).length, count_4: (days[0].reservations_4 || []).length }
  const d = days[day]
  const col = (label, rows) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Label>{label} {rows.length}</Label>
      <Card>
        {rows.length === 0 && <div style={{ padding: '14px', color: C.sub, fontSize: 14 }}>{d.missing ? '아직 불러오지 않음' : '예약 없음'}</div>}
        {rows.map((r, i) => {
          const { a, b, span } = parseRoomTime(r.time, r._date || d.date)
          const now = day === 0 && span[0] <= t0 && t0 <= span[1], done = day === 0 && span[1] < t0
          return (
            <div key={i} style={{ padding: '10px 12px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', opacity: done ? 0.45 : 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: now ? COL.room : C.text }}>{a}–{b}{now && <span style={{ fontSize: 11, marginLeft: 6, color: '#fff', background: COL.room, borderRadius: 999, padding: '1px 6px', verticalAlign: 2 }}>이용 중</span>}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name || '-'}</div>
            </div>
          )
        })}
      </Card>
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map((x, i) => (
          <button key={i} onClick={() => setDay(i)} aria-pressed={day === i} style={{ ...plain, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 10px', background: day === i ? COL.room : C.card, color: day === i ? '#fff' : COL.room, border: `0.5px solid ${day === i ? COL.room : C.sep}` }}>
            {i === 0 ? '오늘' : x.label}{(x.count_2 + x.count_4) > 0 && ` ${x.count_2 + x.count_4}`}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {col('2인실', d.reservations_2 || [])}
        {col('4인실', d.reservations_4 || [])}
      </div>
      <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 14 }}>Updated {data.updated_time}</div>
    </div>
  )
}

// 월별 매출: 이번 달·지난달 일별 누적 선 그래프 + 요약
function MonthlyChart({ prev, curr, top }) {
  const W = 340, H = 150, L = 34, B = 18
  const x = i => L + i / 30 * (W - L - 6)
  const y = v => 6 + (1 - v / top) * (H - B - 6)
  const line = arr => arr.map((v, i) => v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ')
  const ticks = [0, top / 2, top]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="월별 누적 매출">
      {ticks.map(v => <g key={v}><line x1={L} x2={W - 6} y1={y(v)} y2={y(v)} stroke={C.sep} /><text x={L - 4} y={y(v) + 3} fontSize="9" fill={C.sub} textAnchor="end">{man(v)}</text></g>)}
      {[1, 5, 10, 15, 20, 25, 31].map(dd => <text key={dd} x={x(dd - 1)} y={H - 4} fontSize="9" fill={C.sub} textAnchor="middle">{dd}</text>)}
      <polyline points={line(prev)} fill="none" stroke="#b8bcc4" strokeWidth="1.6" strokeDasharray="4 3" />
      <polyline points={line(curr)} fill="none" stroke={COL.monthly} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  )
}

function MonthlyDetail() {
  const { data: d, status, error, loading } = useApi('/api/monthly_detail')
  if (status === 404 || (d && !d.cum_curr)) return <IframeDetail k="monthly" path="/monthly" />
  if (error) return <Muted>{error}</Muted>
  if (loading && !d) return <Muted>불러오는 중…</Muted>
  const num = v => typeof v === 'number' ? v : Number(String(v || 0).replace(/[^\d]/g, ''))
  const cur = num(d.summary_amount_curr), predicted = num(d.predicted_amount), avg = num(d.daily_avg)
  const today = new Date().getDate()
  // 지난달 같은 날까지 누적 (그날 기록이 없으면 그 전 마지막 값)
  const prevSameDay = d.cum_prev.slice(0, today).filter(v => v != null).pop() || 0
  const diff = prevSameDay ? Math.round((cur - prevSameDay) / prevSameDay * 100) : null
  const top = Math.max(predicted, ...d.cum_prev.filter(v => v != null), ...d.cum_curr.filter(v => v != null), 1)
  const row = (label, value, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderTop: `0.5px solid ${C.sep}`, fontSize: 15 }}>
      <span style={{ color: C.sub }}>{label}</span><b style={{ fontWeight: 600, color }}>{value}</b>
    </div>
  )
  return (
    <div>
      <Card style={{ padding: '14px 16px 8px' }}>
        <div style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>{d.month}월 누적</div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: COL.monthly }}>{won(cur)}원</div>
        {diff != null && <div style={{ fontSize: 13, color: diff >= 0 ? '#2d9e6b' : '#d95f4b', fontWeight: 600 }}>지난달 같은 날보다 {diff >= 0 ? '+' : ''}{diff}%</div>}
        <div style={{ marginTop: 8 }}><MonthlyChart prev={d.cum_prev} curr={d.cum_curr} top={top} /></div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: C.sub, padding: '2px 0 4px', justifyContent: 'center' }}>
          <span><span style={{ display: 'inline-block', width: 14, height: 2, background: COL.monthly, verticalAlign: 3, marginRight: 4 }} />{d.month}월</span>
          <span><span style={{ display: 'inline-block', width: 14, height: 0, borderTop: '2px dashed #b8bcc4', verticalAlign: 3, marginRight: 4 }} />{d.prev_month}월</span>
        </div>
      </Card>
      <Card style={{ marginTop: 10 }}>
        <div style={{ marginTop: -1 }} />
        {row(`${d.month}월 예상 매출`, `${won(predicted)}원`, COL.monthly)}
        {row(`최근 ${d.recent_n || 30}일 일평균`, `${won(avg)}원`)}
        {row(`${d.prev_month}월 매출`, `${won(d.summary_amount_prev)}원`)}
      </Card>
      <MonthHistory />
      <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 14 }}>Updated {d.updated_time}</div>
    </div>
  )
}

// 지난 달들 매출: 맥이 모아 두는 날짜별 매출 기록(코보페이는 1년 지나면 사라짐). 달을 누르면 일별 막대
function MonthHistory() {
  const { data } = useApi('/api/sales_archive')
  const [open, setOpen] = useState(null)
  const days = data?.days
  if (!days || !Object.keys(days).length) return null
  const months = {}
  for (const [k, v] of Object.entries(days)) months[k.slice(0, 7)] = (months[k.slice(0, 7)] || 0) + v
  const list = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0]))
  const max = Math.max(...list.map(x => x[1]), 1)
  const dailyOf = ym => {
    const [y, m] = ym.split('-').map(Number), n = new Date(y, m, 0).getDate()
    return Array.from({ length: n }, (_, i) => { const k = `${ym}-${String(i + 1).padStart(2, '0')}`; return { date: k, amount: days[k] ?? null } })
  }
  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, padding: '16px 4px 6px' }}>월별 매출 · {list.length}개월</div>
      <Card>
        {list.map(([ym, total], i) => (
          <div key={ym} style={{ borderTop: i ? `0.5px solid ${C.sep}` : 'none' }}>
            <button onClick={() => setOpen(open === ym ? null : ym)} aria-expanded={open === ym} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', color: C.text, fontSize: 14.5 }}>
              <span style={{ width: 66, textAlign: 'left', flexShrink: 0 }}>{ym.slice(2, 4)}년 {Number(ym.slice(5))}월</span>
              <span style={{ flex: 1, height: 6, background: '#eee', borderRadius: 9, overflow: 'hidden' }}><span style={{ display: 'block', width: `${total / max * 100}%`, height: '100%', background: COL.monthly, opacity: open === ym ? 1 : 0.55, borderRadius: 9 }} /></span>
              <b style={{ fontWeight: 600, width: 64, textAlign: 'right' }}>{man(total)}</b>
            </button>
            {open === ym && <div style={{ padding: '0 12px 8px' }}><DayBars days={dailyOf(ym)} field="amount" color={COL.monthly} H={100} fmt={man} /></div>}
          </div>
        ))}
      </Card>
    </>
  )
}

// 상품 표: 1회·시간·기간이용권 칩으로 바꿔 보고, 판매·연장 켜짐을 점으로
const PRODUCT_TABS = [['once', '1회이용권'], ['hour', '시간이용권'], ['period', '기간이용권'], ['fixed', '고정석']]
function ProductTable() {
  const { data, status, error, loading } = useApi('/api/products')
  const [tab, setTab] = useState('once')
  if (status === 404) return <IframeDetail k="product" path="/product" />
  if (error) return <Muted>{error}</Muted>
  if (loading && !data) return <Muted>불러오는 중…</Muted>
  // 고정석 탭: 코보페이 '고정석' 탭에서 수집한 상품(+ 다른 탭에 섞인 이름에 '고정석'이 든 상품), 다른 탭에서는 뺀다
  const isFixed = p => (p.name || '').includes('고정석')
  const list = k => k === 'fixed'
    ? [...(data.tabs.fixed || []), ...['once', 'hour', 'period'].flatMap(t => (data.tabs[t] || []).filter(isFixed))]
    : (data.tabs[k] || []).filter(p => !isFixed(p))
  const rows = list(tab)
  const flag = (on, label) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 600, color: on ? COL.product : C.sub, opacity: on ? 1 : 0.6 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? COL.product : 'transparent', border: `1.5px solid ${on ? COL.product : C.sub}`, boxSizing: 'border-box' }} />{label}
    </span>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {PRODUCT_TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} style={{ ...plain, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 10px', background: tab === k ? COL.product : C.card, color: tab === k ? '#fff' : COL.product, border: `0.5px solid ${tab === k ? COL.product : C.sep}` }}>
            {label} {list(k).filter(p => p.sale).length}/{list(k).length}
          </button>
        ))}
      </div>
      {rows.length === 0 ? <Muted>{tab === 'fixed' ? (data.fixed_note || '아직 고정석 상품을 수집하지 않았어요 (다음 수집 후 보여요)') : '상품이 없어요'}</Muted> : (
        <Card>
          {rows.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 14.5 }}>
              <div style={{ flex: 1, minWidth: 0, opacity: p.sale || p.extend ? 1 : 0.5 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: C.sub }}>{p.unit} · {won(p.price)}원</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>{flag(p.sale, '판매')}{flag(p.extend, '연장')}</div>
            </div>
          ))}
        </Card>
      )}
      <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 14 }}>Updated {data.updated}</div>
    </div>
  )
}

// 날짜별 막대 (빈 날은 비워 둠). 마지막 막대 위에 값
function DayBars({ days, field, color, H = 120, fmt = v => v }) {
  const vals = days.map(x => x[field])
  const max = Math.max(1, ...vals.filter(v => v != null))
  const W = 340, gap = days.length > 60 ? 1 : 2, bw = (W - gap * (days.length - 1)) / days.length
  const lastI = vals.reduce((a, v, i) => v != null ? i : a, -1)
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} style={{ display: 'block', width: '100%' }}>
      {days.map((x, i) => {
        const v = vals[i]
        if (v == null) return null
        const h = Math.max(2, v / max * (H - 16))
        return <rect key={x.date} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={Math.min(2, bw / 2)} fill={color} opacity={i === lastI ? 1 : 0.45} />
      })}
      {lastI >= 0 && <text x={Math.min(W - 2, lastI * (bw + gap) + bw / 2)} y={H - Math.max(2, vals[lastI] / max * (H - 16)) - 4} textAnchor="end" fontSize="11" fontWeight="700" fill={color}>{fmt(vals[lastI])}</text>}
      {[0, Math.floor(days.length / 2), days.length - 1].map(i => days[i] && (
        <text key={i} x={i === 0 ? 0 : i === days.length - 1 ? W : i * (bw + gap) + bw / 2} y={H + 13} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#8e8e93">{days[i].date.slice(5).replace('-', '/')}</text>
      ))}
    </svg>
  )
}

// 이용자 상세: 날짜별 기간권 수 · 총 이용자 수 (맥이 그날 마지막 값을 남김)
// 오늘 자유석 이용자 수 (시간대별) — 예전 좌석 창 위 그래프
function TodaySeatCard({ card, head, cum }) {
  const { data: d } = useApi('/api/seat_detail')
  if (!d?.history) return null
  return <div style={card}>{head('오늘 자유석 (시간대별)', `지금 ${d.used_free}/${d.total_free}${cum != null ? ` · 누적 ${cum}명` : ''}`)}<SeatChart d={d} H={150} /></div>
}

function UsersDetail({ cum }) {
  const { data: d, status, error, loading } = useApi('/api/daily_counts')
  const [range, setRange] = useState(30)
  const card = { background: C.card, border: `0.5px solid ${C.sep}`, borderRadius: 16, padding: '12px 12px 6px', marginBottom: 10 }
  const head = (t, v) => <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>{t}<span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: C.sub }}>{v}</span></div>
  // 날짜별 기록이 아직 없어도 오늘 그래프는 보이게
  const only = m => <div><TodaySeatCard card={card} head={head} cum={cum} /><Muted>{m}</Muted></div>
  if (status === 404 || (d && !d.days)) return only('맥이 새 코드를 받은 뒤부터 쌓여요')
  if (error) return only(error)
  if (loading && !d) return <Muted>불러오는 중…</Muted>
  const by = Object.fromEntries(d.days.map(x => [x.date, x]))
  const days = Array.from({ length: range }, (_, i) => {
    const t = new Date(Date.now() - (range - 1 - i) * 864e5)
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    return { date: k, ...by[k] }
  })
  const avg = f => { const v = days.map(x => x[f]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : '-' }
  const recent = [...d.days].reverse().slice(0, range)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ display: 'flex', background: '#e9e9eb', borderRadius: 9, padding: 2 }}>
          {[30, 90].map(n => (
            <button key={n} onClick={() => setRange(n)} aria-pressed={range === n} style={{ ...plain, fontSize: 12, fontWeight: 600, borderRadius: 7, padding: '4px 10px', background: range === n ? '#fff' : 'transparent', color: range === n ? C.text : C.sub, boxShadow: range === n ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' }}>{n}일</button>
          ))}
        </div>
      </div>
      <TodaySeatCard card={card} head={head} cum={cum} />
      <div style={card}>{head('기간권 등록', `평균 ${avg('period')}명`)}<DayBars days={days} field="period" color={COL.users} /></div>
      <div style={card}>{head('총 이용자 (하루)', `평균 ${avg('users')}명`)}<DayBars days={days} field="users" color={COL.seat} /></div>
      <Card>
        <div style={{ display: 'flex', padding: '8px 12px', fontSize: 12, color: C.sub, fontWeight: 600 }}><span style={{ flex: 1 }}>날짜</span><span style={{ width: 70, textAlign: 'right' }}>기간권</span><span style={{ width: 70, textAlign: 'right' }}>이용자</span></div>
        {recent.map(x => (
          <div key={x.date} style={{ display: 'flex', padding: '8px 12px', borderTop: `0.5px solid ${C.sep}`, fontSize: 14 }}>
            <span style={{ flex: 1 }}>{x.date.slice(5).replace('-', '/')} ({'일월화수목금토'[new Date(x.date + 'T00:00').getDay()]})</span>
            <span style={{ width: 70, textAlign: 'right' }}>{x.period ?? '-'}</span>
            <span style={{ width: 70, textAlign: 'right' }}>{x.users ?? '-'}</span>
          </div>
        ))}
      </Card>
      {d.updated && <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 12 }}>Updated {d.updated}</div>}
    </div>
  )
}

function Detail({ k, d, onClose, onSms, onReload, onSettings }) {
  const info = DETAIL[k]
  useBackClose(true, onClose)
  return (
    <Sheet title={info.title} tint={COL[k]} doneLabel="닫기" hideCancel onDone={onClose} onBackdrop={onClose} inset>
      {/* 상품 판매는 보기만 — 판매 설정(시험기간·잔여 제한·전체 OFF 등)은 '판매 설정' 버튼(= ⋯ > 설정) */}
      {k === 'product' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 10px', fontSize: 13, color: C.sub }}>
          지금 판매 모드
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: COL.product, borderRadius: 999, padding: '2px 9px' }}>{d.product.mode}</span>
          {/* 판매 설정 창을 바로 (상품 창 위에 열림) */}
          <button onClick={onSettings} style={{ ...plain, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 600, color: COL.product }}>판매 설정<ChevronRight size={14} /></button>
        </div>
      )}
      {k === 'seat' ? <SeatDetail />
        : k === 'payment' ? <PaymentDetail />
        : k === 'locker' ? <LockerList d={d} onSms={onSms} />
        : k === 'room' ? <RoomDetail />
        : k === 'monthly' ? <MonthlyDetail />
        : k === 'product' ? <ProductTable />
        : k === 'users' ? <UsersDetail cum={d.seat.today_users} />
        : <IframeDetail k={k} path={info.path} />}
    </Sheet>
  )
}

// 매장 문열기 (⋯ 메뉴): 맥의 앤딩 앱이 코보페이 로그인으로 문열기를 누른다 (실제 문이 열리므로 한 번 더 묻는다)
// 진행 중·완료는 헤더에 작은 표시로만 보여준다
function useGate(onLogin) {
  const [status, setStatus] = useState(null) // null | 'busy' | 'done'
  async function open() {
    if (status === 'busy' || !await ask('매장 문을 열까요?')) return
    setStatus('busy')
    try {
      const res = await fetch(`${API}/api/gate/open`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (res.status === 401 || res.status === 403) { setStatus(null); tell('문열기는 앤딩 로그인이 필요해요'); onLogin(); return }
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || `문열기 실패 (${res.status})`)
      setStatus('done'); setTimeout(() => setStatus(null), 3000)
    } catch (e) { setStatus(null); tell(e.message || '문열기에 실패했어요') }
  }
  const badge = status && (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: status === 'done' ? '#fff' : GREEN, background: status === 'done' ? GREEN : GREEN + '14', borderRadius: 999, padding: '5px 10px' }}>
      <DoorOpen size={14} />{status === 'busy' ? '여는 중…' : '열었어요'}
    </span>
  )
  return { open, badge }
}

export default function AndingHome() {
  const navigate = useNavigate()
  const tabBar = useShowTabBar()
  const [state, setState] = useState({ loading: true })
  const [detail, setDetail] = useState(null)
  const [sms, setSms] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [layout, saveLayout] = useLayout()

  const load = useCallback(async () => {
    try { setState(await getSummary()) } catch (e) { setState({ error: e.message }) }
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('anding-locker-ended', load)
    // 수집 스크립트가 1~5분 간격이라 1분마다 다시 받는다 (화면이 보일 때만)
    const t = setInterval(() => { if (!document.hidden) load() }, 60000)
    return () => { clearInterval(t); window.removeEventListener('anding-locker-ended', load) }
  }, [load])

  const [loginOpen, setLoginOpen] = useState(false)
  const [tool, setTool] = useState(null) // ⋯ 메뉴 도구: settings | sms | salary | visits | layout
  const gate = useGate(() => setLoginOpen(true))
  const menu = [
    { label: '문열기', run: gate.open },
    { label: '설정', run: () => setTool('settings') },
    { label: '문자 생성기', run: () => setTool('sms') },
    { label: '급여 관리표', run: () => setTool('salary') },
    { label: '방문 기록', run: () => setTool('visits') },
    { label: '박스 배치', run: () => setTool('layout') },
    // 현황은 Supabase에서 읽어 로그인 없이 보이지만, 문자·판매 설정·사물함 종료는 앤딩 로그인이 필요
    { label: '앤딩 로그인', run: () => setLoginOpen(true) },
    { label: '로그아웃', danger: true, run: async () => { if (!await ask('앤딩에서 로그아웃 할까요?')) return; await fetch(`${API}/logout`, { credentials: 'same-origin' }).catch(() => {}); load() } },
  ]

  const d = state.data && freshen(state.data)
  const lockerTs = d?.locker.updated
  useEffect(() => { if (lockerTs !== undefined) preloadMap('locker_map.png', lockerTs) }, [lockerTs])
  // 좌석도 미리: 좌석 상세 데이터와 좌석 배치도를 받아 두어 좌석 시트가 바로 뜨게
  const seatTs = d?.seat.updated
  useEffect(() => {
    if (seatTs === undefined) return
    loadApi('/api/seat_detail').then(r => r.data && preloadMap('seat_map.png', r.data.updated)).catch(() => {})
  }, [seatTs])
  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: F, color: C.text, letterSpacing: '-0.01em' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: `${tabBar ? 'calc(8px + env(safe-area-inset-top))' : 'calc(16px + env(safe-area-inset-top))'} 12px calc(32px + var(--tabbar, 0px) + env(safe-area-inset-bottom))` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, position: 'relative' }}>
          <div style={{ fontSize: tabBar ? 22 : 28, fontWeight: 700, letterSpacing: tabBar ? '-0.5px' : '-0.7px', lineHeight: tabBar ? '38px' : 1.25 }}>앤딩</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {gate.badge}
          <button aria-label="메뉴" onClick={() => setMenuOpen(o => !o)} style={{ ...plain, width: 38, height: 38, borderRadius: 12, background: C.card, border: `0.5px solid ${C.sep}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text }}>
            <MoreHorizontal size={18} />
          </button>
          </div>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 41, background: '#fff', borderRadius: 14, border: `0.5px solid ${C.sep}`, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 170 }}>
                {menu.map(m => (
                  <button key={m.label} onClick={() => { setMenuOpen(false); m.run() }} style={{ ...plain, display: 'block', width: '100%', textAlign: 'left', borderRadius: 10, padding: '10px 12px', fontSize: 15, color: m.danger ? '#d95f4b' : C.text, whiteSpace: 'nowrap' }}>{m.label}</button>
                ))}
              </div>
            </>
          )}
        </div>

        {state.loading && <div style={{ textAlign: 'center', color: C.sub, padding: '80px 0' }}>불러오는 중…</div>}
        {(state.login || loginOpen) && <Login onDone={() => { setLoginOpen(false); load() }} />}
        {state.error && (
          <div style={{ textAlign: 'center', color: C.sub, padding: '60px 0', fontSize: 15, lineHeight: 1.6 }}>
            앤딩 서버에 연결하지 못했어요<br /><span style={{ fontSize: 13 }}>{state.error}</span><br />
            <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 14 }}>
              <button onClick={load} style={{ ...plain, color: GREEN, fontWeight: 600, fontSize: 15 }}>다시 시도</button>
              <button onClick={() => navigate('/anding/classic')} style={{ ...plain, color: C.text, fontWeight: 600, fontSize: 15 }}>기존 화면 열기</button>
            </div>
          </div>
        )}
        {d && (
          <>
            <Hero d={d} open={setDetail} keys={layout.top} />
            <AndingMemo />
            <Todo d={d} onSms={setSms} open={setDetail} />
            <Tiles d={d} open={setDetail} keys={layout.bottom} />
            <div style={{ textAlign: 'center', fontSize: 11.5, color: C.sub, marginTop: 14 }}>{d.stale
              ? <span style={{ color: '#d97706' }}>맥 수집이 {(d.now || '').slice(5, 16).replace('-', '/')}에서 멈춰 있어요 · 날짜는 오늘 기준</span>
              : <>Updated {hhmm(d.seat.updated) || hhmm(d.now)} · 1분마다 자동 갱신</>}</div>
          </>
        )}
      </div>
      {detail && d && <Detail k={detail} d={d} onClose={() => setDetail(null)} onSms={setSms} onReload={load} onSettings={() => setTool('settings')} />}
      {sms && <SmsSheet r={sms} onClose={() => setSms(null)} />}
      {tool === 'settings' && <SettingsSheet onClose={() => setTool(null)} onApplied={load} />}
      {tool === 'sms' && <SmsToolSheet onClose={() => setTool(null)} />}
      {tool === 'salary' && <SalarySheet onClose={() => setTool(null)} />}
      {tool === 'visits' && <VisitsSheet onClose={() => setTool(null)} />}
      {tool === 'layout' && <LayoutSheet layout={layout} onSave={saveLayout} onClose={() => setTool(null)} />}
    </div>
  )
}
