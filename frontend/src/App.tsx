import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Activity, Bike, Dumbbell, Fish, Home, Salad, Settings } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Running from './pages/Running'
import RunningSetup from './pages/RunningSetup'
import SettingsPage from './pages/SettingsPage'
import Food from './pages/Food'
import FoodSetup from './pages/FoodSetup'
import ComingSoon from './pages/ComingSoon'
import Onboarding from './pages/Onboarding'
import { checkProfileExists } from './lib/api'

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard', end: true },
  { to: '/running', icon: Activity, label: 'Running' },
  { to: '/biking', icon: Bike, label: 'Biking' },
  { to: '/swimming', icon: Fish, label: 'Swimming' },
  { to: '/gym', icon: Dumbbell, label: 'Gym' },
  { to: '/food', icon: Salad, label: 'Food' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (location.pathname === '/onboarding') {
      setChecking(false)
      return
    }
    checkProfileExists().then(({ exists }) => {
      if (!exists) navigate('/onboarding', { replace: true })
    }).finally(() => setChecking(false))
  }, [])

  if (checking) return null

  if (location.pathname === '/onboarding') {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
      </Routes>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: 200,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.5px' }}>
            🧱 brickhub
          </span>
        </div>
        <div style={{ padding: '16px 12px', flex: 1 }}>
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 'var(--radius)',
                marginBottom: 2,
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                background: isActive ? 'var(--border)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.1s',
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main style={{ flex: 1, overflow: 'auto', padding: 32 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/running" element={<Running />} />
          <Route path="/running/setup" element={<RunningSetup />} />
          <Route path="/biking" element={<ComingSoon module="Biking" milestone="M2" />} />
          <Route path="/food" element={<Food />} />
          <Route path="/food/setup" element={<FoodSetup />} />
          <Route path="/gym" element={<ComingSoon module="Gym" milestone="M5" />} />
          <Route path="/swimming" element={<ComingSoon module="Swimming" milestone="M6" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
