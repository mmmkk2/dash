import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/index'
import Calculator from './pages/calculator'
import Dashboard from './pages/dashboard'
import Budget from './pages/budget'
import Assets from './pages/assets'
import Login, { supabase } from './pages/login'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined=로딩중

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setSession(session ?? null))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null // 로딩 중 빈 화면
  if (!session) return <Login onLogin={setSession} />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/assets" element={<Assets />} />
      </Routes>
    </BrowserRouter>
  )
}
