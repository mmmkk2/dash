import { useNavigate } from 'react-router-dom'
import AssetsApp from '../assets-app'

export default function Assets() {
  const navigate = useNavigate()
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => navigate('/budget')} style={{ position: 'fixed', top: 14, right: 14, zIndex: 999, background: '#3d2b20cc', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(6px)', fontFamily: 'inherit' }}>💰 가계부</button>
      <AssetsApp />
    </div>
  )
}
