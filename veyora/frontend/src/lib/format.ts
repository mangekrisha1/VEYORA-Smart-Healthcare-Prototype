/** Display helpers. All timestamps are shown in Asia/Kolkata (IST).
 *  The backend stores UTC; appointment dates/times are IST wall-clock. */

export const DISPLAY_TZ = 'Asia/Kolkata'

export function formatLogDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: DISPLAY_TZ,
  })
}

export function formatLogTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: DISPLAY_TZ,
  })
}

/** "2026-10-06" -> "Tue, 6 Oct" (date-only string, already IST). */
export function formatApptDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function logLabel(type: string): string {
  switch (type) {
    case 'HEART_RATE': return 'Heart rate'
    case 'TEMPERATURE': return 'Temperature'
    case 'BLOOD_PRESSURE': return 'Blood pressure'
    default: return type
  }
}

export function logValueText(log: { type: string; value: number | null; systolic: number | null; diastolic: number | null }): string {
  if (log.type === 'BLOOD_PRESSURE') return `${log.systolic}/${log.diastolic} mmHg`
  if (log.type === 'HEART_RATE') return `${Math.round(log.value ?? 0)} bpm`
  return `${log.value?.toFixed(1)} °C`
}
