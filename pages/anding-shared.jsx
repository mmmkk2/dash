// 앤딩 화면(anding-home)과 도구 화면(anding-tools)이 같이 쓰는 값·작은 부품
// /andingapp/* 는 vercel.json에서 앤딩 앱으로 중계되어 같은 주소라 로그인 쿠키가 그대로 실린다.
export const API = '/andingapp'
export const F = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif"
export const C = { bg: '#f7f7f7', card: '#fff', text: '#1c1c1e', sub: 'rgba(60,60,67,0.6)', sep: 'rgba(60,60,67,0.12)', fill: 'rgba(118,118,128,0.1)' }
// 앤딩 테마(naebiseo_theme.js)의 섹션 색과 같게
export const COL = { seat: '#3d7ebf', product: '#2d9e6b', payment: '#7b52ab', monthly: '#1a8fa0', room: '#d97706', locker: '#c2537a', users: '#5a67c9' }
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
