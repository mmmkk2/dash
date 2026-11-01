// 앤딩 화면(anding-home)과 도구 화면(anding-tools)이 같이 쓰는 값·작은 부품
// /andingapp/* 는 vercel.json에서 앤딩 앱으로 중계되어 같은 주소라 로그인 쿠키가 그대로 실린다.
export const API = '/andingapp'
export const F = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif"
export const C = { bg: '#f7f7f7', card: '#fff', text: '#1c1c1e', sub: 'rgba(60,60,67,0.6)', sep: 'rgba(60,60,67,0.12)', fill: 'rgba(118,118,128,0.1)' }
// 성격별로 단정하게: 사람(좌석·이용자) 파랑 · 돈(결제·월 매출) 보라 · 스터디룸 주황 · 사물함 장미 · 상품 초록
// (스터디룸·사물함은 아래 박스에 나란히 있어 같은 색이면 헷갈려 나눔)
// 흰 바탕에서 글씨로 써도 읽히는 진하기(대비 4.5 이상). 앤딩 앱(naebiseo_theme.js·dashboard_app.css)도 같은 색
const PEOPLE = '#3271b3', MONEY = '#7b52ab', PLACE = '#b8590e', LOCKER = '#b8466e', GOODS = '#2f8064'
export const COL = { seat: PEOPLE, users: PEOPLE, payment: MONEY, monthly: MONEY, room: PLACE, locker: LOCKER, product: GOODS }
export const GREEN = '#3e9478'
export const plain = { border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: F }

export const won = n => (n ?? 0).toLocaleString('ko-KR')

export function Switch({ on, onChange, color }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} style={{ ...plain, width: 44, height: 26, borderRadius: 999, background: on ? color : 'rgba(120,120,128,0.24)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .15s' }} />
    </button>
  )
}
