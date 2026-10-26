import { ExternalLink } from 'lucide-react'

// 앤딩 스터디카페 관리자(별도 앱)를 내비서 안 한 화면으로 띄운다
export const ANDING_ADMIN_URL = 'https://andingapp.vercel.app/andingapp/admin'

export default function Anding() {
  return (
    <div style={{ position: 'relative', height: 'calc(100dvh - var(--tabbar, 0px))', background: '#f5f7f9' }}>
      <iframe title="앤딩스터디카페 관리자" src={ANDING_ADMIN_URL} allow="clipboard-write"
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
      {/* 안에서 안 열리거나 로그인이 유지되지 않을 때를 위한 탈출구 */}
      <a href={ANDING_ADMIN_URL} target="_blank" rel="noopener noreferrer" aria-label="새 창으로 열기" style={{
        position: 'absolute', top: 'calc(10px + env(safe-area-inset-top))', right: 10, display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: 'none',
        color: '#1c1c1e', background: 'rgba(255,255,255,0.85)', border: '0.5px solid rgba(60,60,67,0.18)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', fontFamily: "-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
      }}>새 창 <ExternalLink size={12} /></a>
    </div>
  )
}
