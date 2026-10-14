import { Link } from 'react-router-dom'

export default function InfiniteBuying() {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f5f7f9' }}>
      <nav aria-label="Dash 메뉴" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 20px', borderBottom: '1px solid #e5eaee', background: '#fff', fontSize: 12, flexShrink: 0 }}>
        <Link to="/budget" style={{ color: '#52636e', textDecoration: 'none' }}>← 가계부</Link>
        <Link to="/assets" style={{ color: '#52636e', textDecoration: 'none' }}>내 자산</Link>
        <strong style={{ marginLeft: 'auto', color: '#177864' }}>무한매수 · V4.0</strong>
      </nav>
      <iframe title="무한매수 매일 매수·매도 주문표" src="/tools/infinite-buying/index.html" style={{ border: 0, width: '100%', flex: 1, minHeight: 0 }} />
    </div>
  )
}
