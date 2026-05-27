import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Calculator from './pages/calculator'
import Budget from './pages/budget'
import Assets from './pages/assets'
import Login, { supabase } from './pages/login'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setSession(session ?? null))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Login onLogin={setSession} />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/budget" replace />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/assets" element={<Assets />} />
      </Routes>
    </BrowserRouter>
  )
}
