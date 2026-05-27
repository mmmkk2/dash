import { useNavigate } from 'react-router-dom'
import BudgetApp from '../budget-app'

export default function Budget() {
  const navigate = useNavigate()
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => navigate('/assets')}
        style={{ position: 'fixed', top: 14, right: 14, zIndex: 999, background: '#23408099', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(6px)', fontFamily: 'inherit' }}
      >📊 자산</button>
      <BudgetApp />
    </div>
  )
}
