import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header style={{ padding: '1rem', borderBottom: '1px solid #ddd', display: 'flex', gap: '1.5rem' }}>
      <Link to="/">홈</Link>
      <Link to="/calculator">계산기</Link>
      <Link to="/dashboard">대시보드</Link>
    </header>
  )
}
