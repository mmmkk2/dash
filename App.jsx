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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/calculator" element={<Calculator />} />
        {session ? (
          <>
            <Route path="/" element={<Navigate to="/budget" replace />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/assets" element={<Assets />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Login onLogin={setSession} />} />
            <Route path="/budget" element={<Login onLogin={setSession} />} />
            <Route path="/assets" element={<Login onLogin={setSession} />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  )
}
