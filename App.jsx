import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Calculator from './pages/calculator'
import Budget from './pages/budget'
import Assets from './pages/assets'
import Login, { supabase } from './pages/login'

// 페이지(주소)별 브라우저 탭 제목
const PAGE_TITLES = {
  '/': '내 도구',
  '/calculator': '경매 수익 계산기',
  '/dashboard': '앤딩 비품관리',
  '/budget': '가계부 · 개인',
  '/budget/personal': '가계부 · 개인',
  '/budget/anding': '가계부 · 앤딩스터디카페',
  '/budget/cafe': '가계부 · 앤딩스터디카페',
  '/budget/realty': '가계부 · 부동산매매',
  '/assets': '내 자산',
}

function TitleManager() {
  const { pathname } = useLocation()
  useEffect(() => {
    const path = pathname.replace(/\/$/, '') || '/'
    document.title = PAGE_TITLES[path] || (path.startsWith('/budget') ? '가계부' : '내 도구')
  }, [pathname])
  return null
}

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
      <TitleManager />
      <Routes>
        <Route path="/calculator" element={<Calculator />} />
        {session ? (
          <>
            <Route path="/" element={<Navigate to="/budget" replace />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/budget/:entity" element={<Budget />} />
            <Route path="/assets" element={<Assets />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Login onLogin={setSession} />} />
            <Route path="/budget" element={<Login onLogin={setSession} />} />
            <Route path="/budget/:entity" element={<Login onLogin={setSession} />} />
            <Route path="/assets" element={<Login onLogin={setSession} />} />
          </>
        )}
      </Routes>
      <Analytics />
    </BrowserRouter>
  )
}
