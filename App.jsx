import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/index'
import Calculator from './pages/calculator'
import Dashboard from './pages/dashboard'
import Budget from './pages/budget'
import Assets from './pages/assets'

export default function App() {
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
