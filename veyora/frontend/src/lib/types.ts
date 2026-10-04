export type Role = 'PATIENT' | 'DOCTOR' | 'PROJECT_MANAGER'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  specialty?: string | null
}

export interface DoctorSummary {
  id: number
  name: string
  specialty: string | null
  working_days: string[]
}

export interface Slot {
  time: string
  available: boolean
}

export type AppointmentStatus =
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'

export type AppointmentWorkflowStatus =
  | AppointmentStatus
  | 'IN_PROGRESS'

export interface Consultation {
  summary: string | null
  follow_up_date: string | null
  cancellation_reason: string | null
  started_at: string | null
  completed_at: string | null
  updated_at: string | null
}

export interface Appointment {
  id: number
  doctor_id: number
  date: string
  start_time: string
  status: AppointmentStatus
  workflow_status?: AppointmentWorkflowStatus
  created_at: string
  consultation?: Consultation | null
  doctor?: {
    id: number
    name: string
    specialty: string | null
  }
  patient?: {
    id: number
    name: string
  }
}

export type LogType =
  | 'HEART_RATE'
  | 'TEMPERATURE'
  | 'BLOOD_PRESSURE'

export interface HealthLog {
  id: number
  type: LogType
  value: number | null
  systolic: number | null
  diastolic: number | null
  note: string | null
  taken_at: string
}

export type RiskStatus = 'OPEN' | 'CLOSED'
export type Band = 'Low' | 'Moderate' | 'High' | 'Critical'

export interface Risk {
  id: number
  code: string
  title: string
  description: string
  category: string
  probability: number
  impact: number
  score: number
  band: Band
  owner: string
  mitigation: string
  contingency: string
  status: RiskStatus
  control_status: 'Planned' | 'Implemented' | 'Verified'
  review_date: string | null
  linked_requirement: string | null
  linked_task: string | null
  linked_verification: string | null
  jira_id?: string | null
  jira_key?: string | null
  jira_url?: string | null
  jira_status?: string | null
  jira_updated_at?: string | null
}

export type IncidentCategory =
  | 'Appointment'
  | 'Availability'
  | 'Privacy/access'
  | 'Data accuracy'
  | 'Other'

export type IncidentPriority = 'Low' | 'Medium' | 'High' | 'Critical'
export type IncidentStatus = 'Open' | 'In progress' | 'Resolved'

export interface IncidentActivity {
  id: number
  incident_id: number
  actor_id: number
  actor_name: string
  action: string
  details: string
  created_at: string
}

export interface Incident {
  id: number
  reference: string
  title: string
  category: IncidentCategory
  description: string
  priority: IncidentPriority
  status: IncidentStatus
  appointment_id: number | null
  appointment_ref: string | null
  risk_id: number | null
  risk_code: string | null
  reported_by_id: number
  reported_by_name: string
  resolution_note: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  jira_id?: string | null
  jira_key?: string | null
  jira_url?: string | null
  jira_status?: string | null
  jira_updated_at?: string | null
  activities?: IncidentActivity[]
}

export interface CoordinatorAppointment {
  id: number
  reference: string
  doctor_id: number
  doctor_name: string
  doctor_specialty: string
  date: string
  start_time: string
  status: AppointmentStatus
  workflow_status: AppointmentWorkflowStatus
  created_at?: string
}

export interface ClinicOverviewData {
  today: string
  metrics: {
    total_today: number
    confirmed_today: number
    in_progress_today: number
    completed_today: number
    cancelled_today: number
    open_incidents: number
  }
  schedule: CoordinatorAppointment[]
  urgent_incidents: Incident[]
}

export interface JiraConnectionStatus {
  configured: boolean
  connected: boolean
  site_url?: string
  project_key?: string
  project_name?: string
  user?: string
  issue_types?: { id: string; name: string }[]
  message: string
}

export interface RiskMetrics {
  total: number
  open: number
  closed: number
  critical: number
  high: number
  moderate: number
  low: number
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'

export interface Task {
  id: number
  title: string
  description: string
  status: TaskStatus
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  owner: string
  risk_id: number | null
  risk_code: string | null
  jira_key: string | null
  jira_url: string | null
}

export interface Milestone {
  id: number
  title: string
  due_date: string
  status: 'Planned' | 'In progress' | 'Done'
  notes: string
}

export interface VerificationRecord {
  id: number
  req_id: string
  req_text: string
  risk_code: string | null
  control: string
  test_name: string
  expected: string
  result: 'PENDING' | 'PASS' | 'FAIL'
  kind: 'automated' | 'manual'
  run_date: string | null
  evidence_source: string | null
}

export interface Reminder {
  appointment_id: number
  date: string
  start_time: string
  doctor: { id: number; name: string } | null
  read: boolean
}