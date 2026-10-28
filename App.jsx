import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Calculator from './pages/calculator'
import Budget from './pages/budget'
import Assets from './pages/assets'
import Anding from './pages/anding'
import Notes from './pages/notes'
import Login, { supabase } from './pages/login'
import TabBar from './src/TabBar'
import { InstallFloat } from './src/InstallButton'

// 페이지(주소)별 브라우저 탭 제목
// 앱 바로가기(같은 주소 안에서만 가능)용: 외부 앤딩 관리자 화면으로 넘겨준다
function GoAnding() {
  useEffect(() => { window.location.replace('https://andingapp.vercel.app/andingapp/admin') }, [])
  return null
}

const PAGE_TITLES = {
  '/': '내비서',
  '/calculator': '경매 수익 계산기',
  '/dashboard': '앤딩 비품관리',
  '/budget': '가계부 · 개인',
  '/budget/personal': '가계부 · 개인',
  '/budget/anding': '가계부 · 앤딩스터디카페',
  '/budget/cafe': '가계부 · 앤딩스터디카페',
  '/budget/realty': '가계부 · 부동산매매',
  '/budget/goion': '가계부 · 고이온',
  '/assets': '내 자산',
  '/anding': '앤딩 관리자',
  '/notes': '메모',
  '/notes/calendar': '일정',
}

function TitleManager() {
  const { pathname } = useLocation()
  useEffect(() => {
    const path = pathname.replace(/\/$/, '') || '/'
    document.title = PAGE_TITLES[path] || (path.startsWith('/budget') ? '가계부' : '내비서')

    const iconHref = path.startsWith('/assets') ? '/favicon-assets.svg' : path.startsWith('/notes') ? '/icons/icon.svg?v=4' : '/favicon.svg'
    const favicon = document.getElementById('favicon')
    const appleIcon = document.getElementById('apple-touch-icon')
    if (favicon) favicon.href = iconHref
    if (appleIcon) appleIcon.href = iconHref
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
        <Route path="/go/anding" element={<GoAnding />} />
        {session ? (
          <>
            <Route path="/" element={<Navigate to="/budget" replace />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/budget/:entity" element={<Budget />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/anding" element={<Anding />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/calendar" element={<Notes />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Login onLogin={setSession} />} />
            <Route path="/budget" element={<Login onLogin={setSession} />} />
            <Route path="/budget/:entity" element={<Login onLogin={setSession} />} />
            <Route path="/assets" element={<Login onLogin={setSession} />} />
            <Route path="/anding" element={<Login onLogin={setSession} />} />
            <Route path="/notes/*" element={<Login onLogin={setSession} />} />
          </>
        )}
      </Routes>
      {session && <TabBar />}
      {session && <InstallFloat />}
      <Analytics />
    </BrowserRouter>
  )
}
