import { useNavigate } from 'react-router-dom'

const apps = [
  {
    path: '/calculator',
    icon: '🏠',
    title: '경매 수익 계산기',
    desc: '낙찰가 · 대출 비교 · 순이익 시뮬레이션',
    bg: 'linear-gradient(135deg, #1a1714 0%, #3d2b1a 100%)',
    tag: '매매사업자용',
  },
  {
    path: '/dashboard',
    icon: '📦',
    title: '앤딩 비품관리',
    desc: 'Gmail 연동 · 구매이력 · 재고 현황',
    bg: 'linear-gradient(135deg, #374151 0%, #4b5563 100%)',
    tag: '상도점 · 무인',
  },
  {
    path: '/budget',
    icon: '💰',
    title: '가계부',
    desc: '수입 · 지출 · 카드 관리 · 월별 통계',
    bg: 'linear-gradient(135deg, #1e3a2f 0%, #2d5a42 100%)',
    tag: '개인 재무',
  },
]

export default function Home() {
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background: '#f0f2f5', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.18em', color: '#aaa', textTransform: 'uppercase', marginBottom: 8 }}>Dashboard</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#1a1a2e', letterSpacing: '-0.03em' }}>내 도구</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400 }}>
        {apps.map(app => (
          <button
            key={app.path}
            onClick={() => navigate(app.path)}
            style={{ background: app.bg, border: 'none', borderRadius: 20, padding: '28px 24px', cursor: 'pointer', textAlign: 'left', color: '#fff', boxShadow: '0 8px 32px #0000001a', transition: 'transform .15s, box-shadow .15s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 40px #00000025'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px #0000001a'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 36, lineHeight: 1 }}>{app.icon}</div>
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.15em', opacity: 0.7, textTransform: 'uppercase', marginBottom: 5 }}>{app.tag}</div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 5 }}>{app.title}</div>
                <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>{app.desc}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
