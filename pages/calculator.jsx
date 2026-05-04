import { useNavigate } from 'react-router-dom'
import AuctionCalc from '../auction-calc'

export default function Calculator() {
  const navigate = useNavigate()
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => navigate('/')}
        style={{ position: 'fixed', top: 14, right: 14, zIndex: 999, background: '#1a1714cc', backdropFilter: 'blur(8px)', color: '#fff', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}
      >
        ← 홈
      </button>
      <AuctionCalc />
    </div>
  )
}
