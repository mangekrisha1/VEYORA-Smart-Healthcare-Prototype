import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './state/AuthContext'
import AppShell from './components/AppShell'
import Landing from './pages/Landing'
import Login from './pages/Login'
import PatientOverview from './pages/patient/Overview'
import Book from './pages/patient/Book'
import HealthLogs from './pages/patient/HealthLogs'
import DoctorAppointments from './pages/doctor/Appointments'
import ClinicOverview from './pages/coordinator/Overview'
import AppointmentMonitor from './pages/coordinator/Monitor'
import Risks from './pages/pm/Risks'

function homeForRole(role: string) {
  if (role === 'PATIENT') return '/app'
  if (role === 'DOCTOR') return '/app/doctor'
  return '/app/coordinator'
}

function RequireRole({
  roles,
  children,
}: {
  roles: string[]
  children: ReactNode
}) {
  const { user, loading } = useAuth()

  if (loading) return <div className="page-loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />

  if (!roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />
  }

  return <>{children}</>
}

function HomeRedirect() {
  const { user, loading } = useAuth()

  if (loading) return <div className="page-loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />

  if (user.role !== 'PATIENT') {
    return <Navigate to={homeForRole(user.role)} replace />
  }

  return <PatientOverview />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/app"
        element={
          <RequireRole roles={['PATIENT', 'DOCTOR', 'PROJECT_MANAGER']}>
            <AppShell />
          </RequireRole>
        }
      >
        <Route index element={<HomeRedirect />} />

        <Route
          path="book"
          element={
            <RequireRole roles={['PATIENT']}>
              <Book />
            </RequireRole>
          }
        />

        <Route
          path="health"
          element={
            <RequireRole roles={['PATIENT']}>
              <HealthLogs />
            </RequireRole>
          }
        />

        <Route
          path="my-appointments"
          element={
            <RequireRole roles={['PATIENT']}>
              <PatientOverview mode="appointments" />
            </RequireRole>
          }
        />

        <Route
          path="reminders"
          element={
            <RequireRole roles={['PATIENT']}>
              <PatientOverview mode="reminders" />
            </RequireRole>
          }
        />

        <Route
          path="doctor"
          element={
            <RequireRole roles={['DOCTOR']}>
              <DoctorAppointments key="overview" mode="overview" />
            </RequireRole>
          }
        />

        <Route
          path="appointments"
          element={
            <RequireRole roles={['DOCTOR']}>
              <DoctorAppointments key="appointments" mode="appointments" />
            </RequireRole>
          }
        />

        <Route
          path="consultations"
          element={
            <RequireRole roles={['DOCTOR']}>
              <DoctorAppointments key="consultations" mode="consultations" />
            </RequireRole>
          }
        />

        <Route
          path="coordinator"
          element={
            <RequireRole roles={['PROJECT_MANAGER']}>
              <ClinicOverview />
            </RequireRole>
          }
        />

        <Route
          path="monitor"
          element={
            <RequireRole roles={['PROJECT_MANAGER']}>
              <AppointmentMonitor />
            </RequireRole>
          }
        />

        <Route
          path="risks"
          element={
            <RequireRole roles={['PROJECT_MANAGER']}>
              <Risks />
            </RequireRole>
          }
        />

        <Route
          path="plan"
          element={
            <RequireRole roles={['PROJECT_MANAGER']}>
              <Navigate to="/app/coordinator" replace />
            </RequireRole>
          }
        />

        <Route
          path="tasks"
          element={
            <RequireRole roles={['PROJECT_MANAGER']}>
              <Navigate to="/app/coordinator" replace />
            </RequireRole>
          }
        />

        <Route
          path="verification"
          element={
            <RequireRole roles={['PROJECT_MANAGER']}>
              <Navigate to="/app/coordinator" replace />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}