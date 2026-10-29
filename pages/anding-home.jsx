import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, MessageSquare, ChevronRight } from 'lucide-react'
import { useShowTabBar } from '../src/TabBar'
import { Sheet, useBackClose } from '../notes-app'
import { supabase } from './login'
import { API, F, C, COL, GREEN, plain, won, Switch } from './anding-shared'
import { SettingsSheet, SmsToolSheet, SalarySheet } from './anding-tools'

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
async function mapUrl(name, ts) {
  try {
    const { data } = await supabase.storage.from('anding').createSignedUrl(name, 3600)
    if (data?.signedUrl) return data.signedUrl
  } catch {}
  return `${API}/static/images/${name}?ts=${encodeURIComponent(ts || '')}`
}
function useMapUrl(name, ts) {
  const [url, setUrl] = useState(null)
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
function freshen(d) {
  const now = new Date(), today = ymdDot(now), nowHM = now.toTimeString().slice(0, 5)
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
      items: d.studyroom.items.filter(r => (r.date || dataDay) === today).map(r => ({ ...r, now: r.start <= nowHM && nowHM <= r.end, done: r.end < nowHM })),
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

function Hero({ d }) {
  const s = d.seat
  const cell = (label, value) => (
    <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 12, padding: '8px 10px', fontSize: 11.5, minWidth: 0 }}>
      {label}<div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
  const date = d.today
  return (
    <div style={{ borderRadius: 20, padding: '16px 18px', color: '#fff', background: `linear-gradient(135deg, ${GREEN}, #2f7d8f)` }}>
      <div style={{ fontSize: 12.5, opacity: 0.85, fontWeight: 600 }}>오늘 매출 · {date.getMonth() + 1}월 {date.getDate()}일</div>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', margin: '2px 0 10px' }}>{won(d.payment.amount)}원</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {cell('잔여 좌석', s.remain ?? '-')}
        {cell('결제', `${d.payment.count}건`)}
        {cell(`${d.monthly.month}월 누적`, man(d.monthly.amount))}
      </div>
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
  return <button onClick={copy} aria-label={`'${text}' 복사`} style={{ ...plain, fontSize: 12, fontWeight: 600, color: COL.locker, background: COL.locker + '14', borderRadius: 999, padding: '4px 9px', flexShrink: 0 }}>{copied ? '복사됨' : '리셋 복사'}</button>
}

function LockerEndChip({ r }) {
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  if (!isLockerExpired(r)) return null
  const end = async e => {
    e.stopPropagation()
    if (busy || !confirm(`사물함 ${r.no}번 · ${r.name || '미등록'}\n만료: ${r.end}\n\n이용을 종료해서 빈 사물함으로 바꿀까요?`)) return
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
          alert(job.message || '이용 종료 완료')
          return
        }
        if (job.status === 'error') throw new Error(job.message)
      }
      throw new Error('처리 시간이 길어지고 있어요. 다시 누르기 전에 현황을 새로고침해 주세요.')
    } catch (error) { alert(error.message || '종료 처리에 실패했어요') }
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
    if (!confirm(`${r.name || ''} ${r.hp}\n이 번호로 문자를 보낼까요?`)) return
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

// 처리할 것: 사물함 만료완료·만료예정, 지금 이용 중인 스터디룸
function Todo({ d, onSms }) {
  const rows = [
    // 빈 고정석은 맨 위 (배치도에서 흰 칸 = 이용권 없는 자리, 새 고정석 손님을 받을 수 있음). 오른쪽은 마지막 이용자
    ...(d.seat.fixed_ended || []).map(r => ({ c: COL.seat, text: <>고정석 {r.no}번 <b style={{ fontWeight: 600 }}>빈 자리</b></>, right: r.end ? `${r.name || ''} ~${r.end.slice(5, 10).replace('.', '/')}`.trim() : '' })),
    ...d.locker.expired.map(r => ({ c: COL.locker, text: <>사물함 {r.no}번 {r.name || '미등록'} <b style={{ fontWeight: 600 }}>만료됨</b></>, right: r.end.slice(5, 10).replace('.', '/'), sms: { ...r, kind: 'expired' } })),
    ...d.locker.expiring.map(r => ({ c: COL.locker, text: <>사물함 {r.no}번 {r.name || '미등록'} <b style={{ fontWeight: 600 }}>오늘 만료</b></>, right: hhmm(r.end), sms: { ...r, kind: 'expired' } })),
    ...d.studyroom.items.filter(r => r.now).map(r => ({ c: COL.room, text: <>스터디룸 {r.room} {r.name} 이용 중</>, right: `~${r.end}` })),
  ]
  if (!rows.length) return null
  return (
    <>
      <Label>확인할 것 {rows.length}</Label>
      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}` }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 14.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.c, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text}</div>
            <span style={{ color: C.sub, fontSize: 12 }}>{r.right}</span>
            {r.sms && <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5, maxWidth: 210 }}><SmsChip r={r.sms} onSms={onSms} /><LockerEndChip r={r.sms} /><LockerResetCopyChip r={r.sms} /></div>}
          </div>
        ))}
      </div>
    </>
  )
}

function Tile({ color, title, value, unit, sub, bar, onClick }) {
  return (
    <button onClick={onClick} style={{ ...plain, textAlign: 'left', background: C.card, border: `0.5px solid ${C.sep}`, borderRadius: 16, padding: '12px 13px', minHeight: 108, display: 'flex', flexDirection: 'column', color: C.text, minWidth: 0 }}>
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

function Tiles({ d, open }) {
  const s = d.seat
  const used = (s.used_free ?? 0) + (s.used_laptop ?? 0), total = (s.total_free ?? 0) + (s.total_laptop ?? 0)
  const rooms = d.studyroom.items.filter(r => !r.done)
  const lockerAlert = d.locker.expired.length + d.locker.expiring.length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
      <Tile color={COL.seat} title="좌석" value={used} unit={total ? `/${total}` : ''} bar={total ? used / total * 100 : null}
        sub={`노트북 ${s.used_laptop ?? '-'}/${s.total_laptop ?? '-'} · 오늘 ${s.today_users ?? '-'}명`} onClick={() => open('seat')} />
      <Tile color={COL.payment} title="결제" value={`${d.payment.count}건`} sub={`${won(d.payment.amount)}원 · ${hhmm(d.payment.updated)} 기준`} onClick={() => open('payment')} />
      <Tile color={COL.room} title="스터디룸" value={`${rooms.length}건`}
        sub={rooms.length ? rooms.map(r => `${r.room} ${r.start}–${r.end}`).join(' · ') : '남은 예약 없음'} onClick={() => open('room')} />
      <Tile color={COL.locker} title="사물함" value={d.locker.active ?? '-'} unit={`/${d.locker.total}`}
        sub={lockerAlert ? <span style={{ color: COL.locker, fontWeight: 600 }}>만료 {d.locker.expired.length} · 오늘 {d.locker.expiring.length}</span> : '만료 없음'} onClick={() => open('locker')} />
      <Tile color={COL.product} title="상품 판매" value={d.product.mode} sub={`구매 ${d.product.buy}`} onClick={() => open('product')} />
      <Tile color={COL.monthly} title={`${d.monthly.month}월 매출`} value={man(d.monthly.amount)}
        sub={`일평균 ${man(d.monthly.daily_avg)} · 예상 ${man(d.monthly.predicted)}`} onClick={() => open('monthly')} />
    </div>
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
            <LockerEndChip r={r} />
            <LockerResetCopyChip r={r} />
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
function useApi(path) {
  const [st, setSt] = useState({ loading: true })
  useEffect(() => {
    let alive = true
    setSt(o => ({ ...o, loading: true }))
    fromSync(path).then(synced => synced ? alive && setSt({ data: synced }) : fetch(API + path, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(async r => ({ status: r.status, body: await r.json().catch(() => null) }))
      .then(({ status, body }) => alive && setSt(status === 200 && body ? { data: body } : { status, error: body?.error || `불러오기 실패 (${status})` }))
      .catch(e => alive && setSt({ error: e.message })))
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
function SeatChart({ d }) {
  const W = 340, H = 130, L = 26, B = 18
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

// 좌석 상세: 위에 요약·그래프, 아래는 칩으로 하나씩 (배치도 / 곧 종료 / 자유석 / 노트북석 / 고정석) — 세로로 길게 늘어지지 않게
function SeatDetail() {
  const { data: d, status, error, loading } = useApi('/api/seat_detail')
  const seatMap = useMapUrl('seat_map.png', d?.updated)
  const [view, setView] = useState('map')
  const [mapFailed, setMapFailed] = useState(false)
  if (status === 404) return <IframeDetail k="seat" path="/seat" />
  if (error) return <Muted>{error}</Muted>
  if (loading && !d) return <Muted>불러오는 중…</Muted>
  const now = Date.now()
  const parse = s => new Date((s || '').replace(/\./g, '-').replace(' ', 'T')).getTime()
  const soon = (d.seats['자유석'] || []).filter(r => { const e = parse(r.end); return e >= now && e - now <= 6 * 3600e3 }).sort((a, b) => parse(a.end) - parse(b.end))
  const views = [
    ['map', '배치도', null],
    ['soon', '곧 종료', soon, true],
    ['free', '자유석', d.seats['자유석'] || []],
    ['laptop', '노트북석', d.seats['노트북석'] || []],
    ['fixed', '고정석', d.seats['고정석'] || [], true],
  ]
  const cur = views.find(v => v[0] === view) || views[0]
  // 한 사람 한 줄: 좌석 · 이름 · 상품 · 시각
  const list = (rows, end) => rows.length === 0 ? <Muted>없어요</Muted> : (
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
      <div style={{ fontSize: 15, color: C.sub, padding: '0 4px' }}>자유석 {d.used_free}/{d.total_free} · 잔여 {d.remaining} · 노트북 {d.used_laptop}/{d.total_laptop}</div>
      <Card style={{ padding: '8px 8px 2px', marginTop: 8 }}><SeatChart d={d} /></Card>
      <div style={{ display: 'flex', gap: 6, margin: '10px 0 8px', overflowX: 'auto' }}>
        {views.map(([k, label, rows]) => (
          <button key={k} onClick={() => setView(k)} aria-pressed={view === k} style={{ ...plain, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap', background: view === k ? COL.seat : C.card, color: view === k ? '#fff' : COL.seat, border: `0.5px solid ${view === k ? COL.seat : C.sep}` }}>
            {label}{rows ? ` ${rows.length}` : ''}
          </button>
        ))}
      </div>
      {cur[0] === 'map'
        ? (seatMap && !mapFailed ? <Card key="map"><img src={seatMap} alt="좌석 배치도" onError={() => setMapFailed(true)} style={{ display: 'block', width: '100%' }} /></Card> : <Muted>배치도가 아직 없어요</Muted>)
        : <div key={view}>{list(cur[2], cur[3])}</div>}
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
const roomTimes = t => (t || '').split('~').map(x => x.trim().slice(-5))
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
  const d = days[day]
  const nowHM = new Date().toTimeString().slice(0, 5)
  const col = (label, rows) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Label>{label} {rows.length}</Label>
      <Card>
        {rows.length === 0 && <div style={{ padding: '14px', color: C.sub, fontSize: 14 }}>{d.missing ? '아직 불러오지 않음' : '예약 없음'}</div>}
        {rows.map((r, i) => {
          const [a, b] = roomTimes(r.time)
          const now = day === 0 && a <= nowHM && nowHM <= b, done = day === 0 && b < nowHM
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
      <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 14 }}>Updated {d.updated_time}</div>
    </div>
  )
}

// 상품 표: 1회·시간·기간이용권 칩으로 바꿔 보고, 판매·연장 켜짐을 점으로
const PRODUCT_TABS = [['once', '1회이용권'], ['hour', '시간이용권'], ['period', '기간이용권']]
function ProductTable() {
  const { data, status, error, loading } = useApi('/api/products')
  const [tab, setTab] = useState('once')
  if (status === 404) return <IframeDetail k="product" path="/product" />
  if (error) return <Muted>{error}</Muted>
  if (loading && !data) return <Muted>불러오는 중…</Muted>
  const rows = data.tabs[tab] || []
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
            {label} {(data.tabs[k] || []).filter(p => p.sale).length}/{(data.tabs[k] || []).length}
          </button>
        ))}
      </div>
      {rows.length === 0 ? <Muted>상품이 없어요</Muted> : (
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

function Detail({ k, d, onClose, onSms, onReload }) {
  const info = DETAIL[k]
  useBackClose(true, onClose)
  return (
    <Sheet title={info.title} tint={COL[k]} doneLabel="닫기" hideCancel onDone={onClose} onBackdrop={onClose} full="78dvh" inset>
      {/* 상품 판매는 보기만 — 판매 설정(시험기간·잔여 제한·전체 OFF 등)은 ⋯ > 설정에서 */}
      {k === 'product' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 10px', fontSize: 13, color: C.sub }}>
          지금 판매 모드
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: COL.product, borderRadius: 999, padding: '2px 9px' }}>{d.product.mode}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12 }}>바꾸기: ⋯ › 설정</span>
        </div>
      )}
      {k === 'seat' ? <SeatDetail />
        : k === 'payment' ? <PaymentDetail />
        : k === 'locker' ? <LockerList d={d} onSms={onSms} />
        : k === 'room' ? <RoomDetail />
        : k === 'monthly' ? <MonthlyDetail />
        : k === 'product' ? <ProductTable />
        : <IframeDetail k={k} path={info.path} />}
    </Sheet>
  )
}

export default function AndingHome() {
  const navigate = useNavigate()
  const tabBar = useShowTabBar()
  const [state, setState] = useState({ loading: true })
  const [detail, setDetail] = useState(null)
  const [sms, setSms] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

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
  const [tool, setTool] = useState(null) // ⋯ 메뉴 도구: settings | sms | salary
  const menu = [
    { label: '새로고침', run: load },
    { label: '설정', run: () => setTool('settings') },
    { label: '문자 생성기', run: () => setTool('sms') },
    { label: '급여 관리표', run: () => setTool('salary') },
    { label: '기존 관리자 화면', run: () => navigate('/anding/classic') },
    // 현황은 Supabase에서 읽어 로그인 없이 보이지만, 문자·판매 설정·사물함 종료는 앤딩 로그인이 필요
    { label: '앤딩 로그인', run: () => setLoginOpen(true) },
    { label: '로그아웃', danger: true, run: async () => { if (!confirm('앤딩에서 로그아웃 할까요?')) return; await fetch(`${API}/logout`, { credentials: 'same-origin' }).catch(() => {}); load() } },
  ]

  const d = state.data && freshen(state.data)
  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: F, color: C.text, letterSpacing: '-0.01em' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: `${tabBar ? 'calc(8px + env(safe-area-inset-top))' : 'calc(16px + env(safe-area-inset-top))'} 16px calc(32px + var(--tabbar, 0px) + env(safe-area-inset-bottom))` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, position: 'relative' }}>
          <div style={{ fontSize: tabBar ? 22 : 28, fontWeight: 700, letterSpacing: tabBar ? '-0.5px' : '-0.7px', lineHeight: tabBar ? '38px' : 1.25 }}>앤딩</div>
          <button aria-label="메뉴" onClick={() => setMenuOpen(o => !o)} style={{ ...plain, width: 38, height: 38, borderRadius: 12, background: C.card, border: `0.5px solid ${C.sep}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text }}>
            <MoreHorizontal size={18} />
          </button>
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
            <Hero d={d} />
            <Todo d={d} onSms={setSms} />
            <Tiles d={d} open={setDetail} />
            <div style={{ textAlign: 'center', fontSize: 11.5, color: C.sub, marginTop: 14 }}>{d.stale
              ? <span style={{ color: '#d97706' }}>맥 수집이 {(d.now || '').slice(5, 16).replace('-', '/')}에서 멈춰 있어요 · 날짜는 오늘 기준</span>
              : <>Updated {hhmm(d.seat.updated) || hhmm(d.now)} · 1분마다 자동 갱신</>}</div>
          </>
        )}
      </div>
      {detail && d && <Detail k={detail} d={d} onClose={() => setDetail(null)} onSms={setSms} onReload={load} />}
      {sms && <SmsSheet r={sms} onClose={() => setSms(null)} />}
      {tool === 'settings' && <SettingsSheet onClose={() => setTool(null)} onApplied={load} />}
      {tool === 'sms' && <SmsToolSheet onClose={() => setTool(null)} />}
      {tool === 'salary' && <SalarySheet onClose={() => setTool(null)} />}
    </div>
  )
}
