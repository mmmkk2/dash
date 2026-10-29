import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, Phone, ChevronRight } from 'lucide-react'
import { useShowTabBar } from '../src/TabBar'
import { Sheet, useBackClose } from '../notes-app'

// 앤딩 관리자 메인 — 내비서가 직접 그리는 화면.
// 숫자는 앤딩 앱(맥)의 /api/summary 에서 받고, 상세 표·그래프는 앤딩 앱 화면을 시트 안에 띄운다.
// /andingapp/* 는 vercel.json에서 앤딩 앱으로 중계되어 같은 주소라 로그인 쿠키가 그대로 실린다.
const API = '/andingapp'
const F = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif"
const C = { bg: '#f7f7f7', card: '#fff', text: '#1c1c1e', sub: 'rgba(60,60,67,0.6)', sep: 'rgba(60,60,67,0.12)', fill: 'rgba(118,118,128,0.1)' }
// 앤딩 테마(naebiseo_theme.js)의 섹션 색과 같게
const COL = { seat: '#3d7ebf', product: '#2d9e6b', payment: '#7b52ab', monthly: '#1a8fa0', room: '#d97706', locker: '#c2537a' }
const GREEN = '#3e9478'
const plain = { border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: F }

const won = n => (n ?? 0).toLocaleString('ko-KR')
const man = n => n >= 10000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만` : won(n)
const hhmm = s => (s || '').match(/\d{2}:\d{2}/)?.[0] || ''

async function getSummary() {
  const r = await fetch(`${API}/api/summary`, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
  if (r.status === 401 || r.status === 403) return { login: true }
  if (!r.ok) throw new Error(`앤딩 서버 응답 ${r.status}`)
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('json')) return { login: true } // 로그인 화면으로 넘겨진 경우
  return { data: await r.json() }
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
  const date = new Date(d.now.replace(' ', 'T'))
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

function CallChip({ hp }) {
  if (!hp) return null
  return (
    <a href={`tel:${hp}`} onClick={e => e.stopPropagation()} aria-label={`${hp} 전화`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: GREEN, background: GREEN + '14', borderRadius: 999, padding: '4px 9px', textDecoration: 'none', flexShrink: 0 }}>
      <Phone size={12} />전화
    </a>
  )
}

// 처리할 것: 사물함 만료완료·만료예정, 지금 이용 중인 스터디룸
function Todo({ d }) {
  const rows = [
    ...d.locker.expired.map(r => ({ c: COL.locker, text: <>사물함 {r.no}번 {r.name || '미등록'} <b style={{ fontWeight: 600 }}>만료됨</b></>, right: r.end.slice(5, 10).replace('.', '/'), hp: r.hp })),
    ...d.locker.expiring.map(r => ({ c: COL.locker, text: <>사물함 {r.no}번 {r.name || '미등록'} <b style={{ fontWeight: 600 }}>오늘 만료</b></>, right: hhmm(r.end), hp: r.hp })),
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
            <CallChip hp={r.hp} />
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

function LockerList({ d }) {
  const group = (title, rows) => rows.length > 0 && (
    <>
      <Label>{title} {rows.length}</Label>
      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}` }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', fontSize: 15 }}>
            <b style={{ fontWeight: 600, minWidth: 36 }}>{r.no}번</b>
            <div style={{ flex: 1, minWidth: 0 }}>{r.name || '미등록'}<div style={{ fontSize: 12, color: C.sub }}>{r.end}</div></div>
            <CallChip hp={r.hp} />
          </div>
        ))}
      </div>
    </>
  )
  return (
    <div>
      <div style={{ fontSize: 15, color: C.sub, padding: '0 4px' }}>이용 중 {d.locker.active ?? '-'}개 · 빈 사물함 {d.locker.active != null ? d.locker.total - d.locker.active : '-'}개</div>
      {group('만료완료', d.locker.expired)}
      {group('오늘 만료', d.locker.expiring)}
      {!d.locker.expired.length && !d.locker.expiring.length && <div style={{ textAlign: 'center', color: C.sub, padding: '40px 0' }}>만료된 사물함이 없어요</div>}
      <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 14 }}>Updated {d.locker.updated}</div>
    </div>
  )
}

function Detail({ k, d, onClose }) {
  const info = DETAIL[k]
  const [loaded, setLoaded] = useState(false)
  useBackClose(true, onClose)
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
    <Sheet title={info.title} tint={COL[k]} doneLabel="닫기" hideCancel onDone={onClose} onBackdrop={onClose} full>
      {info.path ? (
        <div style={{ background: '#fff', borderRadius: 16, border: `0.5px solid ${C.sep}`, overflow: 'hidden' }}>
          {!loaded && <div style={{ textAlign: 'center', color: C.sub, padding: '40px 0' }}>불러오는 중…</div>}
          <iframe title={info.title} src={API + info.path} onLoad={onLoad} style={{ border: 0, width: '100%', height: 'calc(88dvh - 110px - env(safe-area-inset-bottom))', display: 'block' }} />
        </div>
      ) : <LockerList d={d} />}
    </Sheet>
  )
}

export default function AndingHome() {
  const navigate = useNavigate()
  const tabBar = useShowTabBar()
  const [state, setState] = useState({ loading: true })
  const [detail, setDetail] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const load = useCallback(async () => {
    try { setState(await getSummary()) } catch (e) { setState({ error: e.message }) }
  }, [])
  useEffect(() => {
    load()
    // 수집 스크립트가 1~5분 간격이라 1분마다 다시 받는다 (화면이 보일 때만)
    const t = setInterval(() => { if (!document.hidden) load() }, 60000)
    return () => clearInterval(t)
  }, [load])

  const menu = [
    { label: '새로고침', run: load },
    { label: '설정', run: () => navigate('/anding/classic?go=env_config') },
    { label: '문자 생성기', run: () => navigate('/anding/classic?go=sms') },
    { label: '급여 관리표', run: () => navigate('/anding/classic?go=salary') },
    { label: '기존 관리자 화면', run: () => navigate('/anding/classic') },
    { label: '로그아웃', danger: true, run: async () => { if (!confirm('앤딩에서 로그아웃 할까요?')) return; await fetch(`${API}/logout`, { credentials: 'same-origin' }).catch(() => {}); load() } },
  ]

  const d = state.data
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
        {state.login && <Login onDone={load} />}
        {state.error && (
          <div style={{ textAlign: 'center', color: C.sub, padding: '60px 0', fontSize: 15, lineHeight: 1.6 }}>
            앤딩 서버에 연결하지 못했어요<br /><span style={{ fontSize: 13 }}>{state.error}</span><br />
            <button onClick={load} style={{ ...plain, marginTop: 14, color: GREEN, fontWeight: 600, fontSize: 15 }}>다시 시도</button>
          </div>
        )}
        {d && (
          <>
            <Hero d={d} />
            <Todo d={d} />
            <Tiles d={d} open={setDetail} />
            <div style={{ textAlign: 'center', fontSize: 11.5, color: C.sub, marginTop: 14 }}>Updated {hhmm(d.seat.updated) || hhmm(d.now)} · 1분마다 자동 갱신</div>
          </>
        )}
      </div>
      {detail && d && <Detail k={detail} d={d} onClose={() => setDetail(null)} />}
    </div>
  )
}
