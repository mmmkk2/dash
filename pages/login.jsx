import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const F = "'Apple SD Gothic Neo','Noto Sans KR','Inter',sans-serif"

export default function Login({ onLogin }) {
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setLoading(false)
    if (error) { setErr('이메일 또는 비밀번호가 올바르지 않습니다.'); return }
    onLogin(data.session)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: F }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: '40px 32px', width: '100%', maxWidth: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔐</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#1a1a2e', letterSpacing: '-0.03em' }}>내 도구</div>
          <div style={{ fontSize: 12, color: '#9c9c9c', marginTop: 4 }}>로그인 후 이용하세요</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
            style={{ padding: '13px 16px', borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 14, outline: 'none', fontFamily: F, background: '#fafafa' }}
          />
          <input
            type="password" placeholder="비밀번호" value={pw} onChange={e => setPw(e.target.value)} required
            style={{ padding: '13px 16px', borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 14, outline: 'none', fontFamily: F, background: '#fafafa' }}
          />
          {err && <div style={{ fontSize: 12, color: '#b5451b', textAlign: 'center' }}>{err}</div>}
          <button type="submit" disabled={loading} style={{ padding: 14, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#1a3258,#2a4e96)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, marginTop: 4, opacity: loading ? 0.6 : 1 }}>
            {loading ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
