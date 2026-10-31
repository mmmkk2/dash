import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, useBackClose } from '../notes-app'
import { supabase } from './login'
import { API, F, C, COL, GREEN, plain, won, Switch } from './anding-shared'
import { ask, tell } from '../src/dialog'

// 앤딩 ⋯ 메뉴의 도구들: 설정 · 문자 생성기 · 급여 관리표 (예전엔 앤딩 앱 화면을 따로 열었음)

const xhr = { 'X-Requested-With': 'XMLHttpRequest' }
const Card = ({ children, style }) => <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}`, overflow: 'hidden', ...style }}>{children}</div>
const Label = ({ children }) => <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, padding: '0 4px 6px', marginTop: 14 }}>{children}</div>
const inputStyle = { border: `0.5px solid ${C.sep}`, borderRadius: 10, padding: '7px 10px', fontSize: 15, fontFamily: F, color: C.text, background: '#fff', outline: 'none', boxSizing: 'border-box' }

function Row({ label, sub, children, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: last ? 'none' : `0.5px solid ${C.sep}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

// 상품 판매 설정 (기존 관리자 화면의 판매 모드 폼과 같은 값) — 즉시 적용하면 맥이 상품 판매 토글을 바로 돌린다
export function SalePanel({ onApplied }) {
  const [st, setSt] = useState(null)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('') // '', 'pending', 'done 12:00:01', 'error …'
  const poll = useRef(null)
  const loadSt = () => fetch(`${API}/api/sale_settings`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? '맥 앤딩 앱에 아직 반영되지 않았어요 (404)' : `불러오기 실패 (${r.status})`)))
    .then(setSt).catch(e => setErr(e.message))
  useEffect(() => { loadSt(); return () => clearInterval(poll.current) }, [])
  if (err) return <div style={{ color: C.sub, fontSize: 14, padding: '4px 4px 12px' }}>판매 설정: {err}</div>
  if (!st) return <div style={{ color: C.sub, fontSize: 14, padding: '4px 4px 12px' }}>판매 설정 불러오는 중…</div>
  const set = (k, v) => setSt(o => ({ ...o, [k]: v }))
  async function apply() {
    const body = new URLSearchParams({ sale_limit: st.sale_limit, sale_release: st.sale_release, sale_limit_time: st.limit_time || '', sale_release_time: st.release_time || '' })
    if (st.exam_mode) body.set('exam_mode', 'true')
    if (st.all_off) body.set('all_off', 'true')
    if (st.auto_limit_on) body.set('auto_limit_on', 'true')
    if (st.auto_release_on) body.set('auto_release_on', 'true')
    body.set('day6h_present', '1'); body.set('day6h_start', st.day6h_start || '12:00'); body.set('day6h_end', st.day6h_end || '22:00')
    if (st.day6h_on) body.set('day6h_on', 'true')
    setStatus('pending')
    try {
      const r = await fetch(`${API}/set_toggle_and_run`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `적용 실패 (${r.status})`)
    } catch (e) { setStatus('error ' + e.message); return }
    // 상품 판매 토글이 끝날 때까지 2초마다 확인 (최대 2분)
    const started = Date.now()
    clearInterval(poll.current)
    poll.current = setInterval(async () => {
      const t = await fetch(`${API}/toggle_status`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(r => r.json()).catch(() => null)
      if (t?.status === 'done') { clearInterval(poll.current); setStatus('done ' + t.completed_at); loadSt(); onApplied() }
      else if (Date.now() - started > 120000) { clearInterval(poll.current); setStatus('error 2분 넘게 끝나지 않았어요 — 기존 관리자 화면에서 확인해 주세요') }
    }, 2000)
  }
  const num = (k, color) => (
    <input type="number" min="1" max="30" value={st[k]} onChange={e => set(k, e.target.value)} style={{ width: 46, padding: '4px 6px', borderRadius: 8, border: `0.5px solid ${C.sep}`, fontSize: 15, textAlign: 'center', fontFamily: F, color }} />
  )
  const time = (k, color) => (
    <input type="time" value={st[k] || ''} onChange={e => set(k, e.target.value)} style={{ padding: '3px 6px', borderRadius: 8, border: `0.5px solid ${C.sep}`, fontSize: 14, fontFamily: F, color, background: '#fff' }} />
  )
  const row = (label, color, k, sub, last) => (
    <div style={{ padding: '11px 14px', borderBottom: last ? 'none' : `0.5px solid ${C.sep}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, fontSize: 15.5, fontWeight: st[k] ? 600 : 400, color: st[k] ? color : C.text }}>{label}</div>
        <Switch on={!!st[k]} onChange={v => set(k, v)} color={color} />
      </div>
      {sub && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, color: C.sub, marginTop: 6 }}>{sub}</div>}
    </div>
  )
  const RED = '#e5484d', BLUE = '#4a90d9', ORANGE = '#d97706'
  const pending = status === 'pending'
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 8px', fontSize: 13, color: C.sub }}>
        지금 판매 모드
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: st.mode_color, borderRadius: 999, padding: '2px 9px' }}>{st.mode}</span>
        {st.last_forced && <span style={{ marginLeft: 'auto' }}>마지막 적용 {st.last_forced.slice(5, 16).replace('-', '/')}</span>}
      </div>
      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.sep}` }}>
        {row('시험기간', BLUE, 'exam_mode', <>구매 {st.exam_buy || '—'} · 연장 {st.exam_ext || '—'}</>)}
        {row('잔여 제한', RED, 'auto_limit_on', <>잔여 {num('sale_limit', RED)} 이하 · {time('limit_time', RED)} 이후 → 제한</>)}
        {row('잔여 풀기', GREEN, 'auto_release_on', <>잔여 {num('sale_release', GREEN)} 이상 · {time('release_time', GREEN)} 이후 → 풀기</>)}
        {'day6h_on' in st && row('낮 시간 6시간권 판매 중지', ORANGE, 'day6h_on', <>{time('day6h_start', ORANGE)} ~ {time('day6h_end', ORANGE)} 동안 1회권 6시간 구매 막기</>)}
        {row('전체 OFF', RED, 'all_off', null, true)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <button onClick={apply} disabled={pending} style={{ ...plain, background: COL.product, color: '#fff', fontSize: 15, fontWeight: 600, borderRadius: 999, padding: '9px 20px', opacity: pending ? 0.5 : 1 }}>즉시 적용</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: status.startsWith('error') ? RED : status.startsWith('done') ? GREEN : C.sub }}>
          {pending ? '적용 중… (1분 정도 걸려요)' : status.startsWith('done') ? `적용 완료 ${status.slice(5)}` : status.startsWith('error') ? status.slice(6) : ''}
        </span>
      </div>
    </div>
  )
}

// ───────────────────────── 설정 ─────────────────────────
// 앤딩 앱 /env_config 와 같은 값 (.env). 네이버 비밀번호는 받아오지 않고, 바꿀 때만 입력
export function SettingsSheet({ onClose, onApplied }) {
  useBackClose(true, onClose)
  const [st, setSt] = useState(null)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch(`${API}/api/env_config`, { credentials: 'same-origin', headers: xhr })
      .then(async r => r.ok ? setSt(await r.json()) : setMsg({ ok: false, text: r.status === 403 ? '앤딩 로그인이 필요해요 (⋯ > 앤딩 로그인)' : r.status === 404 ? '맥 앤딩 앱에 아직 반영되지 않았어요 (404)' : `불러오기 실패 (${r.status})` }))
      .catch(e => setMsg({ ok: false, text: e.message }))
  }, [])
  const set = (k, v) => setSt(o => ({ ...o, [k]: v }))
  const num = (k, w = 56) => <input type="number" min="0" value={st[k]} onChange={e => set(k, e.target.value)} style={{ ...inputStyle, width: w, textAlign: 'center' }} />
  async function save() {
    setBusy(true); setMsg(null)
    const body = new URLSearchParams({
      danger: st.danger, warning: st.warning, cum: st.cum, seat_sale_limit: st.seat_sale_limit, seat_sale_release: st.seat_sale_release,
      naver_id: st.naver_id || '', naver_pw: pw, naver_bize_id: st.naver_bize_id || '', naver_sync_interval: st.naver_sync_interval,
    })
    for (const k of ['alert_danger_seat_enabled', 'alert_warning_seat_enabled', 'seat_auto']) if (st[k]) body.set(k, 'true')
    try {
      const r = await fetch(`${API}/update_env_config`, { method: 'POST', credentials: 'same-origin', headers: xhr, body })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `저장 실패 (${r.status})`)
      setMsg({ ok: true, text: '저장했어요' }); setPw('')
      if (pw) set('naver_pw_set', true)
    } catch (e) { setMsg({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <Sheet title="설정" tint={GREEN} doneLabel={busy ? '저장 중…' : '저장'} doneDisabled={!st || busy} onDone={save} onCancel={onClose} inset>
      {/* 상품 판매 설정은 '즉시 적용'으로 따로 반영, 아래 알림·네이버는 위 '저장'으로 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, padding: '0 4px 6px' }}>상품 판매 <span style={{ fontWeight: 400 }}>· 즉시 적용으로 바로 반영</span></div>
      <SalePanel onApplied={onApplied || (() => {})} />
      {msg && <div style={{ fontSize: 14, fontWeight: 600, color: msg.ok ? GREEN : '#e5484d', padding: '0 4px 8px' }}>{msg.text}</div>}
      {!st && !msg && <div style={{ textAlign: 'center', color: C.sub, padding: '40px 0' }}>불러오는 중…</div>}
      {st && (
        <>
          <Label>좌석 알림 <span style={{ fontWeight: 400 }}>· 위 저장 버튼으로</span></Label>
          <Card>
            <Row label="위험 기준" sub="잔여석이 이 수 이하이면 위험 (DANGER_THRESHOLD)">{num('danger')}</Row>
            <Row label="위험 알림 보내기"><Switch on={!!st.alert_danger_seat_enabled} onChange={v => set('alert_danger_seat_enabled', v)} color="#e5484d" /></Row>
            <Row label="주의 기준" sub="잔여석이 이 수 이하이면 주의 (WARNING_THRESHOLD)">{num('warning')}</Row>
            <Row label="주의 알림 보내기"><Switch on={!!st.alert_warning_seat_enabled} onChange={v => set('alert_warning_seat_enabled', v)} color="#d97706" /></Row>
            <Row label="누적 이용자 경고" sub="오늘 누적 이용자가 이 수 이상 (WARNING_CUM_THRESHOLD)" last>{num('cum')}</Row>
          </Card>
          <Label>네이버 예약 동기화</Label>
          <Card>
            <Row label="아이디"><input value={st.naver_id || ''} onChange={e => set('naver_id', e.target.value)} autoComplete="off" style={{ ...inputStyle, width: 150 }} /></Row>
            <Row label="비밀번호" sub={st.naver_pw_set ? '저장돼 있어요 — 바꿀 때만 입력' : '저장된 비밀번호 없음'}>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" placeholder="••••" style={{ ...inputStyle, width: 150 }} />
            </Row>
            <Row label="업체 ID"><input value={st.naver_bize_id || ''} onChange={e => set('naver_bize_id', e.target.value)} style={{ ...inputStyle, width: 150 }} /></Row>
            <Row label="동기화 간격" sub="초" last>{num('naver_sync_interval', 72)}</Row>
          </Card>
          {/* SEAT_AUTO·SEAT_SALE_*는 어디서도 안 써서 뺐음 — 잔여석 판매 제한·풀기는 위 상품 판매(SALE_LIMIT/SALE_RELEASE) */}
        </>
      )}
    </Sheet>
  )
}

// ───────────────────────── 문자 생성기 ─────────────────────────
// 앤딩 앱 sms_generator.html 의 문구 그대로. 머릿말([카페] + 인사)·꼬리말(감사합니다 + 문의 안내)은 켜고 끌 수 있음
const CAFE = '앤딩스터디카페 상도점'
const KAKAO = 'https://pf.kakao.com/_zxlbTn/chat'
const APP_AND = 'https://is.gd/bZ4LbD', APP_IOS = 'https://is.gd/UkVPMm', ROOM_GUIDE = 'https://is.gd/iqm213', ROOM_REFUND = 'https://is.gd/O9tLul'
const CONTACT = `\n\n문의: ${KAKAO}\n(발신전용번호, 문의는 카카오톡)`
const hi = name => `안녕하세요${name ? `, ${name} 회원님` : ', 회원님'}.`
const ROOM_INFO = `현재 네이버와 직접 연동되지 않기 때문에, 실시간 스터디룸 예약 방법을 아래와 같이 안내드립니다.\n\n앱 다운로드 안내\n• 안드로이드: ${APP_AND}\n• 아이폰: ${APP_IOS}\n\n스터디룸 예약 방법 안내\n${ROOM_GUIDE}\n\n스터디룸 환불 규정\n${ROOM_REFUND}`
const NAME = { id: 'name', label: '회원 이름', placeholder: "비우면 '회원님'" }
const LOCATION = { id: 'location', label: '짐 보관 위치', placeholder: '휴게실 옷걸이 아래' }
// head: 머릿말 인사 / body: 본문 / foot: 꼬리말 (null이면 꼬리말 없음)
// 자주 쓰는 고정석 안내를 맨 위·기본 선택으로
const SMS = [
  { group: '회원 안내', items: [
    { key: 'fixed', label: '고정석 안내', fields: [{ id: 'name', label: '회원 이름', placeholder: '비우면 생략' }], make: v => ({ head: `안녕하세요${v.name ? `, ${v.name} 회원님` : ''}.\n고정석을 구매해 주셔서 감사합니다.`, body: '\n고정석 이용 시 출입문 자동 열림을 위해 키오스크 또는 앱에서 <고정석 입실> 버튼을 하루 1회 눌러주셔야 합니다.\n시스템 관리상 매일 오전 5시에 자동 퇴실 처리되며, 이후 다시 이용하실 경우 고정석 입실을 하루 1회 다시 눌러주셔야 출입문 열림 기능이 정상 활성화됩니다.\n', foot: '감사합니다.' }) },
    { key: 'seat_expire', label: '좌석 만료', fields: [NAME], make: v => ({ head: `${v.name ? `${v.name} 회원님, ` : '회원님, '}이용 중이신 좌석의 이용 시간이 만료되었습니다.`, body: '계속 이용을 원하신다면 키오스크 또는 앱에서 재결제 후 이용해 주시기 바랍니다.', foot: '감사합니다.' }) },
    { key: 'locker', label: '사물함 만료', fields: [NAME], make: v => ({ head: `${v.name ? `${v.name} 회원님, ` : '회원님, '}이용 중이신 사물함의 사용 기간이 만료되었습니다.`, body: '이용을 계속 원하신다면 키오스크 또는 앱에서 연장 결제를 진행해 주세요.\n금일까지 연장이 완료되지 않으면 사물함 이용이 종료될 수 있습니다.', foot: '감사합니다.' }) },
    { key: 'locker_cleared', label: '사물함 종료·짐보관', fields: [NAME, LOCATION], make: v => ({ head: hi(v.name), body: `사물함 결제가 진행되지 않아 이용이 종료되었습니다.\n\n내부 짐은 ${v.location || '휴게실 옷걸이 아래'}에 보관 중이니, 빠른 시일 내에 찾아가 주시기 바랍니다.\n\n미수령 시 발생하는 분실에 대해서는 책임을 지지 않는 점 양해 부탁드립니다.`, foot: '감사합니다.' }) },
    { key: 'refund', label: '환불 안내', fields: [
      { id: 'name', label: '회원 이름', placeholder: '이름' }, { id: 'usedTime', label: '실제 이용시간', placeholder: '3시간 6분' },
      { id: 'roundedTime', label: '올림 적용 시간', placeholder: '4시간' }, { id: 'rate', label: '시간당 요금', placeholder: '2,000' },
      { id: 'deduct', label: '차감 금액', placeholder: '8,000' }, { id: 'refund', label: '환불 금액', placeholder: '21,000' },
      { id: 'noBank', label: '은행명 미기재', toggle: true }, { id: 'minor', label: '미성년자', toggle: true },
    ], make: v => ({ head: hi(v.name), body: `\n이용시간 ${v.usedTime || ''}은 ${v.roundedTime || ''}으로 올림 처리되며, 총 이용시간의 10% 이상 사용에 해당됩니다.\n\n따라서\n${v.roundedTime || ''} × ${v.rate || ''}원 = ${v.deduct || ''}원 차감 후\n환불 금액은 ${v.refund || ''}원입니다.${v.noBank ? '\n\n환불 신청서에 은행명이 기재되지 않아 확인이 어려운 상태입니다.\n은행명 포함하여 다시 전달 부탁드립니다.' : ''}${v.minor ? '\n\n미성년자의 경우 보호자(부모님) 계좌로만 입금 가능합니다.' : ''}\n\n카카오톡 채널로 답변 주시면 확인 후 빠르게 처리 도와드리겠습니다.\n${KAKAO}\n`, foot: '감사합니다.' }) },
  ] },
  { group: '퇴실 / 자리', items: [
    { key: 'checkout_kiosk', label: '퇴실·키오스크', fields: [NAME], make: v => ({ head: hi(v.name), body: '원활한 좌석 운영과 회원님의 이용 시간 보호를 위해 퇴실 시 아래 사항을 꼭 확인해 주시길 부탁드립니다.\n\n1. 좌석 조명(스탠드) 끄기\n2. 키오스크/앱 이용 종료(퇴실) 처리\n   (미처리 시 시간이 계속 차감됩니다)\n\n공용 공간인 만큼 다음 이용자분을 위해 퇴실 시 꼭 한 번 더 확인 부탁드립니다.', foot: '감사합니다.' }) },
    { key: 'checkout_clean', label: '퇴실·정돈', fields: [NAME], make: v => ({ head: hi(v.name), body: '쾌적한 학습 환경 유지를 위해 퇴실 시 아래 사항을 꼭 지켜주시길 부탁드립니다.\n\n1. 의자는 책상 안으로 밀어 넣어주세요.\n2. 지우개 가루 등 개인 쓰레기는 깨끗이 치워주세요.\n\n공용 공간인 만큼 다음 이용자분을 위해 퇴실 시 좌석 정돈 부탁드립니다.', foot: '감사합니다.' }) },
    { key: 'absence', label: '장시간 외출', fields: [NAME], make: v => ({ head: hi(v.name), body: '장시간 외출 시 좌석을 점유하실 수 없습니다.\n책을 올려두고 자리를 비우는 경우에도 동일하게 적용됩니다.\n\n동일한 이용이 반복될 경우 이용이 제한될 수 있습니다.\n이용에 참고 부탁드립니다.', foot: '감사합니다.' }) },
    { key: 'absence_done', label: '짐정리 퇴실', fields: [NAME, LOCATION], make: v => ({ head: hi(v.name), body: `자유석이므로 장시간 부재 시 퇴실 처리됩니다.\n\n짐은 정리되어 ${v.location || '휴게실 옷걸이 아래'} 두었습니다.`, foot: '감사합니다.' }) },
  ] },
  { group: '규칙 안내', items: [
    { key: 'toilet', label: '화장지 안내', fields: [{ id: 'urgent', label: '오늘 또 막혔나요?', toggle: true }], make: v => ({ head: '안녕하세요.', body: v.urgent
      ? '\n⚠ 화장지는 절대 변기에 버리지 마시고 반드시 휴지통에 버려주시기 바랍니다.\n\n오늘도 화장지로 인해 변기가 막히는 문제가 발생했습니다.\n건물 배관 구조상 화장지를 변기에 버릴 경우 막힘 및 역류가 발생할 수 있습니다.\n\n문제가 반복될 경우 CCTV 확인 및 개별 안내가 진행될 수 있습니다.\n쾌적한 이용 환경 유지를 위해 협조 부탁드립니다.'
      : '\n⚠ 화장지는 절대 변기에 버리지 마시고, 반드시 휴지통에 버려주시기 바랍니다.\n\n저희 매장은 오래된 상가 건물로, 배관 구조상 화장지를 변기에 투입할 경우 막힘이 발생할 수 있으며 심한 경우 역류 및 넘침이 발생할 수 있습니다.\n\n쾌적한 이용 환경 유지를 위해 협조 부탁드립니다.', foot: '감사합니다.' }) },
    { key: 'snack', label: '간식 금지', fields: [NAME, { id: 'strict', label: '강경 경고 포함', toggle: true }], make: v => ({ head: hi(v.name), body: `스터디존 내 간식 섭취는 절대 금지입니다.\n비닐 소리, 냄새 등으로 다른 이용자에게 불편을 주는 행위가 발생하지 않도록 반드시 주의해주세요.\n\n간식은 지정된 휴게공간에서만 섭취 가능합니다.${v.strict ? '\n해당 규정을 반복 위반할 경우 즉시 퇴실 및 영구 이용 제한이 될 수 있습니다.' : ''}\n\n모든 회원분들이 집중할 수 있는 환경을 위해 반드시 협조 부탁드립니다.`, foot: null }) },
    { key: 'noise', label: '소음·정숙', fields: [{ id: 'names', label: '회원 이름들', placeholder: '비우면 생략' }], make: v => ({ head: '', body: `스터디존은 절대 정숙 구역입니다. 조용한 학습 환경 유지를 위해 대화 및 통화는 일절 금지되어 있으며, 속닥거리는 작은 소리도 다른 이용자에게 큰 방해가 될 수 있습니다.${v.names ? `\n\n${v.names} 회원님,\n속닥거리거나 쪽지를 주고받으며 공부하실 경우 이곳이 아닌 다른 장소를 이용해 주시기 바랍니다.\n규칙을 지키지 않을 경우 어떠한 예외 없이 즉시 퇴실 조치됩니다.` : ''}\n\n규정 위반이 반복될 경우, 경고 없이 영구 퇴실 및 이용 제한 조치가 이루어질 수 있습니다. 쾌적한 학습 환경을 위해 반드시 협조해 주시기 바랍니다.`, foot: null }) },
  ] },
  { group: '룸 예약', items: [
    { key: 'room_ok', label: '룸 예약 가능', fields: [], make: () => ({ head: '안녕하세요! 앤딩스터디카페 상도점입니다.', body: `\n문의하신 예약 시간에 이용 가능합니다.\n\n${ROOM_INFO}\n`, foot: '감사합니다.' }) },
    { key: 'room_partial', label: '룸 일부 가능', fields: [{ id: 'available', label: '이용 가능한 시간대', placeholder: '14:00~16:00' }], make: v => ({ head: '안녕하세요! 앤딩스터디카페 상도점입니다.', body: `\n문의하신 예약 시간 중 일부만 이용 가능합니다.${v.available ? `\n(이용 가능 시간: ${v.available})` : ''}\n\n${ROOM_INFO}\n`, foot: '감사합니다.' }) },
    { key: 'room_no', label: '룸 예약 불가', fields: [], make: () => ({ head: '안녕하세요! 앤딩스터디카페 상도점입니다.', body: `\n문의하신 시간 해당 룸에 먼저 예약된 다른 예약건이 있어 예약이 어렵습니다.\n\n${ROOM_INFO}\n`, foot: '감사합니다.' }) },
    { key: 'room_entry', label: '룸 입장 안내', fields: [], make: () => ({ head: '안녕하세요. 앤딩스터디카페 상도점입니다.', body: '\n예약하신 룸은 이용 시작 시간 기준 15분 전부터 출입이 가능합니다.\nQR코드는 키오스크가 아닌 출입문 왼쪽 리더기에 찍어주세요.\n', foot: '이용해 주셔서 감사합니다.' }) },
  ] },
  { group: '공지', items: [
    { key: 'notice', label: '공지/이벤트', fields: [{ id: 'name', label: '회원 이름', placeholder: '비우면 전체 공지' }, { id: 'content', label: '공지 내용', placeholder: '5월 연휴 운영시간 변경 안내', area: true }], make: v => ({ head: `안녕하세요${v.name ? `, ${v.name} 회원님` : ''}.`, body: `\n${v.content || ''}\n`, foot: '감사합니다.' }) },
  ] },
]
const SMS_BY_KEY = Object.fromEntries(SMS.flatMap(g => g.items).map(t => [t.key, t]))
const smsBytes = t => [...t].reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)

function buildSms(t, v, withHead, withFoot) {
  const { head, body, foot } = t.make(v)
  let text = ''
  if (withHead) text += `[${CAFE}]\n${head ? head + '\n' : ''}`
  text += body
  if (foot && withFoot) text += `\n${foot}${CONTACT}`
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

export function SmsToolSheet({ onClose }) {
  useBackClose(true, onClose)
  const [key, setKey] = useState('fixed')
  const [vals, setVals] = useState({})
  const [head, setHead] = useState(true)
  const [foot, setFoot] = useState(true)
  const [phone, setPhone] = useState('')
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const t = SMS_BY_KEY[key]
  // 문구는 입력에 따라 바로 다시 만들되, 직접 고친 뒤엔 덮어쓰지 않음 (다시 만들기로 되돌림)
  const generated = useMemo(() => buildSms(t, vals, head, foot), [t, vals, head, foot])
  useEffect(() => { if (!edited) setText(generated) }, [generated, edited])
  const pick = k => { setKey(k); setVals({}); setEdited(false); setMsg(null) }
  const digits = phone.replace(/\D/g, '')
  async function copy() {
    try { await navigator.clipboard.writeText(text); setMsg({ ok: true, text: '복사했어요' }) } catch { setMsg({ ok: false, text: '복사하지 못했어요' }) }
  }
  async function pastePhone() {
    try { const d = (await navigator.clipboard.readText()).replace(/\D/g, ''); if (d.length >= 9 && d.length <= 11) setPhone(d); else setMsg({ ok: false, text: '복사한 내용에 전화번호가 없어요' }) } catch { setMsg({ ok: false, text: '붙여넣기를 허용해 주세요' }) }
  }
  async function send() {
    if (!/^01\d{8,9}$/.test(digits)) return setMsg({ ok: false, text: '받는 사람 휴대폰 번호를 넣어 주세요' })
    if (!await ask(`${digits}\n이 번호로 문자를 보낼까요?`)) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`${API}/api/sms/send`, { method: 'POST', credentials: 'same-origin', headers: { ...xhr, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: digits, text, category: 'info' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(r.status === 403 ? '앤딩 로그인이 필요해요 (⋯ > 앤딩 로그인)' : j.error || `발송 실패 (${r.status})`)
      setMsg({ ok: true, text: '보냈어요' })
    } catch (e) { setMsg({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  const chip = (on, label, onClick) => (
    <button key={label} onClick={onClick} aria-pressed={on} style={{ ...plain, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap', background: on ? GREEN : C.card, color: on ? '#fff' : GREEN, border: `0.5px solid ${on ? GREEN : C.sep}` }}>{label}</button>
  )
  const n = smsBytes(text)
  return (
    <Sheet title="문자 생성기" tint={GREEN} doneLabel={busy ? '보내는 중…' : '보내기'} doneDisabled={busy || !text.trim()} onDone={send} onCancel={onClose} inset>
      {SMS.map(g => (
        <div key={g.group} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, padding: '0 4px 5px' }}>{g.group}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{g.items.map(x => chip(key === x.key, x.label, () => pick(x.key)))}</div>
        </div>
      ))}
      {t.fields.length > 0 && (
        <Card style={{ marginTop: 10 }}>
          {t.fields.map((f, i) => (
            <Row key={f.id} label={f.label} last={i === t.fields.length - 1}>
              {f.toggle ? <Switch on={!!vals[f.id]} onChange={v => { setVals(o => ({ ...o, [f.id]: v })); setEdited(false) }} color={GREEN} />
                : f.area ? <textarea value={vals[f.id] || ''} onChange={e => { setVals(o => ({ ...o, [f.id]: e.target.value })); setEdited(false) }} placeholder={f.placeholder} rows={3} style={{ ...inputStyle, width: '62%', resize: 'vertical' }} />
                : <input value={vals[f.id] || ''} onChange={e => { setVals(o => ({ ...o, [f.id]: e.target.value })); setEdited(false) }} placeholder={f.placeholder} style={{ ...inputStyle, width: 150 }} />}
            </Row>
          ))}
        </Card>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {chip(head, '머릿말', () => { setHead(h => !h); setEdited(false) })}
        {chip(foot, '꼬리말·문의 안내', () => { setFoot(f => !f); setEdited(false) })}
        {edited && <button onClick={() => setEdited(false)} style={{ ...plain, fontSize: 12, fontWeight: 600, color: C.sub, marginLeft: 'auto' }}>다시 만들기</button>}
      </div>
      <textarea value={text} onChange={e => { setText(e.target.value); setEdited(true) }} style={{ ...inputStyle, width: '100%', minHeight: 220, marginTop: 8, borderRadius: 16, padding: '12px 14px', lineHeight: 1.5, resize: 'vertical' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.sub, padding: '4px 4px 0' }}>
        <span>{n > 90 ? '장문(LMS)' : '단문(SMS)'} · {n}바이트</span>
        {msg && <span style={{ color: msg.ok ? GREEN : '#e5484d', fontWeight: 600 }}>{msg.text}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d-]/g, ''))} placeholder="받는 사람 번호" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
        <button onClick={pastePhone} style={{ ...plain, ...inputStyle, fontSize: 13, fontWeight: 600, color: C.text }}>붙여넣기</button>
        <button onClick={copy} style={{ ...plain, ...inputStyle, fontSize: 13, fontWeight: 600, color: C.text }}>복사</button>
      </div>
      <div style={{ fontSize: 12, color: C.sub, padding: '8px 4px 0' }}>보내기를 누르면 앤딩 서버(smsko)로 바로 발송돼요.</div>
    </Sheet>
  )
}

// ───────────────────────── 급여 관리표 ─────────────────────────
// 매니저 근무시간·급여. 지급 기간은 전달 10일 ~ 이번 달 9일, 기본 근무 평일·토 2시간·일 1.5시간.
// 기본과 다른 날만 저장 (Supabase anding_salary, 본인만). 테이블이 없으면 이 기기에만 저장
const WD = ['일', '월', '화', '수', '목', '금', '토']
const DEFAULT_HOURLY = { 2026: 10320 }
const pad2 = n => String(n).padStart(2, '0')
function monthDays(year, mon) {
  const days = []
  for (let d = new Date(year, mon - 2, 10); d <= new Date(year, mon - 1, 9); d.setDate(d.getDate() + 1)) {
    days.push({ date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, dow: d.getDay() })
  }
  return days
}
const defHrs = dow => dow === 0 ? 1.5 : 2
const LOCAL_KEY = y => `dash.andingSalary.${y}`

function useSalary(year) {
  const [data, setData] = useState(null) // { hourly, months: { '1': { hrs: { 'YYYY-MM-DD': n }, extra } } }
  const [where, setWhere] = useState('') // 'cloud' | 'local'
  const timer = useRef(null)
  useEffect(() => {
    let alive = true
    supabase.from('anding_salary').select('data').eq('year', year).maybeSingle().then(({ data: row, error }) => {
      if (!alive) return
      if (error) {
        let local = null
        try { local = JSON.parse(localStorage.getItem(LOCAL_KEY(year))) } catch {}
        setData(local || { months: {} }); setWhere('local')
      } else { setData(row?.data || { months: {} }); setWhere('cloud') }
    })
    return () => { alive = false }
  }, [year])
  const update = fn => setData(prev => {
    const next = fn(prev)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (where === 'cloud') supabase.from('anding_salary').upsert({ year, data: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,year' }).then(() => {})
      else try { localStorage.setItem(LOCAL_KEY(year), JSON.stringify(next)) } catch {}
    }, 600)
    return next
  })
  return { data, update, where }
}

// 보이는 급여표(연간 또는 그 달)를 그림으로: 폰은 공유 창(사진 저장·카톡 등), 안 되면 파일로 내려받기
async function saveImage(el, name) {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: C.bg, useCORS: true, logging: false })
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return } catch (e) { if (e.name === 'AbortError') return }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href) }, 1000)
}

// 이미지 전용 배치: 폰 한 화면(390px 폭)에 보이게 — 그 달은 날짜를 세로 2단, 연간은 12달 2단
function SalaryImage({ year, mon, calc, hourly }) {
  const cell = { padding: '3px 4px', fontSize: 11, textAlign: 'center', borderBottom: `0.5px solid ${C.sep}`, fontVariantNumeric: 'tabular-nums' }
  const head = { ...cell, fontSize: 10, fontWeight: 600, color: '#fff', background: '#5f6b66', borderBottom: 'none' }
  const box = { background: '#fff', borderRadius: 12, border: `0.5px solid ${C.sep}`, overflow: 'hidden' }
  if (!mon) {
    const all = Array.from({ length: 12 }, (_, i) => ({ mon: i + 1, ...calc(i + 1) }))
    const tot = all.reduce((a, m) => ({ hours: a.hours + m.hours, pay: a.pay + m.pay }), { hours: 0, pay: 0 })
    return (
      <div style={{ width: 390, padding: 14, boxSizing: 'border-box', background: C.bg, fontFamily: F, color: C.text }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{year} 매니저 급여 · 연간</div>
        <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>시급 {won(hourly)}원 · 매월 10일 지급</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
          {all.map(m => (
            <div key={m.mon} style={{ ...box, padding: '7px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><b>{m.mon}월</b><span style={{ color: C.sub }}>{m.hours.toFixed(1)}h</span></div>
              <div style={{ fontSize: 13, fontWeight: 700, color: GREEN, textAlign: 'right', marginTop: 2 }}>{won(Math.round(m.pay))}원</div>
              {m.extra > 0 && <div style={{ fontSize: 10, color: '#7b52ab', textAlign: 'right' }}>추가 {won(m.extra)}원</div>}
            </div>
          ))}
        </div>
        <div style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', marginTop: 8, background: '#5f6b66', color: '#fff' }}>
          <b style={{ fontSize: 13 }}>연간 합계 <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.75 }}>{tot.hours.toFixed(1)}h</span></b>
          <b style={{ fontSize: 15 }}>{won(Math.round(tot.pay))}원</b>
        </div>
      </div>
    )
  }
  const m = calc(mon)
  const half = Math.ceil(m.days.length / 2)
  const cols = [m.days.slice(0, half), m.days.slice(half)]
  const first = m.days[0]?.date.replace(/-/g, '.'), last = m.days[m.days.length - 1]?.date.replace(/-/g, '.')
  return (
    <div style={{ width: 390, padding: 14, boxSizing: 'border-box', background: C.bg, fontFamily: F, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{year} · {mon}월 근무기록</div>
        <div style={{ fontSize: 11, color: C.sub }}>{year}.{pad2(mon)}.10 지급</div>
      </div>
      <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{first} ~ {last} · 시급 {won(hourly)}원</div>
      <div style={{ ...box, display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 12px', marginTop: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: GREEN }}>{won(Math.round(m.pay))}원</span>
        <span style={{ fontSize: 12, color: C.sub }}>{m.hours.toFixed(1)}시간{m.extra > 0 && ` · 추가 ${won(m.extra)}원`}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
        {cols.map((col, ci) => (
          <table key={ci} style={{ ...box, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead><tr><th style={head}>날짜</th><th style={head}>요일</th><th style={head}>시간</th><th style={head}>일급</th></tr></thead>
            <tbody>
              {col.map(d => {
                const bg = d.dow === 0 ? '#fff6f6' : d.dow === 6 ? '#f6f8ff' : '#fff'
                return (
                  <tr key={d.date} style={{ background: bg }}>
                    <td style={{ ...cell, color: C.sub }}>{d.date.slice(5).replace('-', '/')}</td>
                    <td style={{ ...cell, fontWeight: d.dow % 6 === 0 ? 700 : 400, color: d.dow === 0 ? '#d14343' : d.dow === 6 ? '#3b6fd1' : C.sub }}>{WD[d.dow]}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>{Number(d.hrs) || 0}</td>
                    <td style={{ ...cell, color: C.sub, textAlign: 'right' }}>{won(Math.round((Number(d.hrs) || 0) * hourly))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  )
}

export function SalarySheet({ onClose }) {
  useBackClose(true, onClose)
  const shotRef = useRef(null)
  const [saving, setSaving] = useState(false) // 저장 중엔 화면 밖에 이미지 전용 배치를 그려 찍는다
  const year = new Date().getFullYear()
  const { data, update, where } = useSalary(year)
  const [tab, setTab] = useState(0) // 0 = 연간
  const hourly = Number(data?.hourly) || DEFAULT_HOURLY[year] || 10320
  const calc = mon => {
    const m = data?.months?.[mon] || {}
    const days = monthDays(year, mon).map(d => ({ ...d, hrs: m.hrs?.[d.date] ?? defHrs(d.dow) }))
    const hours = days.reduce((a, d) => a + (Number(d.hrs) || 0), 0)
    const extra = Number(m.extra) || 0
    return { days, hours, extra, pay: hours * hourly + extra }
  }
  const setMonth = (mon, fn) => update(prev => ({ ...prev, months: { ...prev.months, [mon]: fn(prev.months?.[mon] || {}) } }))
  const chip = (on, label, onClick) => (
    <button key={label} onClick={onClick} aria-pressed={on} style={{ ...plain, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap', background: on ? GREEN : C.card, color: on ? '#fff' : GREEN, border: `0.5px solid ${on ? GREEN : C.sep}` }}>{label}</button>
  )
  return (
    <Sheet title={`${year} 매니저 급여`} tint={GREEN} doneLabel="닫기" hideCancel onDone={onClose} onBackdrop={onClose} inset
      actions={data && (
        <button disabled={saving} onClick={async () => {
          setSaving(true)
          // 이미지 전용 배치가 그려질 때까지 두 프레임 기다림
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          try { await saveImage(shotRef.current, `salary_${year}${tab ? '_' + pad2(tab) : '_year'}.png`) }
          catch { tell('이미지를 만들지 못했어요') } finally { setSaving(false) }
        }} style={{ ...plain, fontSize: 14, fontWeight: 600, color: C.text, padding: '6px 10px', borderRadius: 999, background: C.card, border: `0.5px solid ${C.sep}`, opacity: saving ? 0.5 : 1 }}>
          {saving ? '만드는 중…' : '이미지 저장'}
        </button>
      )}>
      {!data ? <div style={{ textAlign: 'center', color: C.sub, padding: '40px 0' }}>불러오는 중…</div> : (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {chip(tab === 0, '연간', () => setTab(0))}
            {Array.from({ length: 12 }, (_, i) => chip(tab === i + 1, `${i + 1}월`, () => setTab(i + 1)))}
          </div>
          {saving && (
            <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0 }}>
              <div ref={shotRef}><SalaryImage year={year} mon={tab} calc={calc} hourly={hourly} /></div>
            </div>
          )}
          {tab === 0 ? (() => {
            const all = Array.from({ length: 12 }, (_, i) => ({ mon: i + 1, ...calc(i + 1) }))
            const tot = all.reduce((a, m) => ({ hours: a.hours + m.hours, extra: a.extra + m.extra, pay: a.pay + m.pay }), { hours: 0, extra: 0, pay: 0 })
            return (
              <>
                <Card style={{ marginTop: 10 }}>
                  <Row label="시급" sub="매월 10일 지급 · 전달 10일~이번 달 9일">
                    <input type="number" value={hourly} onChange={e => update(p => ({ ...p, hourly: e.target.value }))} style={{ ...inputStyle, width: 90, textAlign: 'right' }} />
                  </Row>
                  {all.map((m, i) => (
                    <button key={m.mon} onClick={() => setTab(m.mon)} style={{ ...plain, display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 14px', borderTop: `0.5px solid ${C.sep}`, color: C.text }}>
                      <b style={{ fontWeight: 600, minWidth: 34 }}>{m.mon}월</b>
                      <span style={{ flex: 1, fontSize: 13, color: C.sub }}>{m.hours.toFixed(1)}시간{m.extra > 0 && ` · 추가 ${won(m.extra)}원`}</span>
                      <b style={{ fontWeight: 600, color: GREEN }}>{won(Math.round(m.pay))}원</b>
                    </button>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderTop: `0.5px solid ${C.sep}`, background: C.fill }}>
                    <b style={{ flex: 1, fontWeight: 700 }}>연간 합계 <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>{tot.hours.toFixed(1)}시간</span></b>
                    <b style={{ fontWeight: 700, fontSize: 16 }}>{won(Math.round(tot.pay))}원</b>
                  </div>
                </Card>
              </>
            )
          })() : (() => {
            const mon = tab, m = calc(mon), first = m.days[0]?.date.replace(/-/g, '.'), last = m.days[m.days.length - 1]?.date.replace(/-/g, '.')
            return (
              <>
                <Card style={{ marginTop: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: C.sub }}>{first} ~ {last} · {year}.{pad2(mon)}.10 지급</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, color: GREEN, letterSpacing: '-0.02em' }}>{won(Math.round(m.pay))}원</span>
                    <span style={{ fontSize: 13, color: C.sub }}>{m.hours.toFixed(1)}시간</span>
                  </div>
                </Card>
                <Card style={{ marginTop: 10 }}>
                  <Row label="추가 수당" sub={m.extra > 0 ? `기본 ${won(Math.round(m.hours * hourly))}원 + 추가 ${won(m.extra)}원` : null} last>
                    <input type="number" min="0" step="1000" value={data.months?.[mon]?.extra || ''} placeholder="0" onChange={e => setMonth(mon, o => ({ ...o, extra: Number(e.target.value) || 0 }))} style={{ ...inputStyle, width: 110, textAlign: 'right' }} />
                  </Row>
                </Card>
                <Card style={{ marginTop: 10 }}>
                  {m.days.map((d, i) => (
                    <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderTop: i ? `0.5px solid ${C.sep}` : 'none', background: d.dow === 0 ? '#fff6f6' : d.dow === 6 ? '#f6f8ff' : '#fff' }}>
                      <span style={{ fontSize: 14, minWidth: 44 }}>{d.date.slice(5).replace('-', '/')}</span>
                      <span style={{ fontSize: 13, minWidth: 16, fontWeight: d.dow % 6 === 0 ? 600 : 400, color: d.dow === 0 ? '#d14343' : d.dow === 6 ? '#3b6fd1' : C.sub }}>{WD[d.dow]}</span>
                      <input type="number" step="0.5" min="0" value={d.hrs} onChange={e => setMonth(mon, o => ({ ...o, hrs: { ...(o.hrs || {}), [d.date]: Number(e.target.value) || 0 } }))} style={{ ...inputStyle, width: 64, padding: '4px 6px', textAlign: 'center', background: '#fffdf0' }} />
                      <span style={{ flex: 1, textAlign: 'right', fontSize: 13, color: C.sub }}>{won(Math.round((Number(d.hrs) || 0) * hourly))}원</span>
                    </div>
                  ))}
                </Card>
              </>
            )
          })()}
          <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 12 }}>
            {where === 'cloud' ? '고친 내용은 바로 저장돼요' : '이 기기에만 저장돼요 (Supabase에 anding_salary 테이블을 만들면 어디서나 같이 보여요)'}
          </div>
        </>
      )}
    </Sheet>
  )
}
