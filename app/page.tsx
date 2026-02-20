'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { callAIAgent, AIAgentResponse } from '@/lib/aiAgent'
import { listSchedules, getScheduleLogs, pauseSchedule, resumeSchedule, cronToHuman, Schedule, ExecutionLog } from '@/lib/scheduler'
import { HiOutlineSearch, HiOutlineClock, HiOutlineMail, HiOutlineCog, HiOutlineChevronDown, HiOutlineChevronUp, HiOutlineExternalLink, HiOutlineRefresh, HiOutlineX, HiOutlinePlus, HiOutlineCheck, HiOutlineBriefcase, HiOutlineHome, HiOutlineCollection, HiOutlineFilter, HiOutlineCalendar, HiOutlinePause, HiOutlinePlay } from 'react-icons/hi'
import { FiRadar, FiActivity } from 'react-icons/fi'

// ─── Constants ────────────────────────────────────────────────────────────────

const MANAGER_AGENT_ID = '69989a105d2326ad4d26cdce'
const SCHEDULE_ID = '69989a17399dfadeac37d150'

const AGENTS = [
  { id: '69989a105d2326ad4d26cdce', name: 'Listing Monitor Manager', role: 'Orchestrates scans and notifications' },
  { id: '699899ecfc075eb63c125e2f', name: 'Web Scanner Agent', role: 'Searches for listings online' },
  { id: '699899fd5c09fa7c2b5b2e70', name: 'Notification Composer Agent', role: 'Composes and sends email alerts' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Listing {
  title: string
  company: string
  location: string
  source_url: string
  source_name: string
  date_posted: string
  listing_type: string
  snippet: string
  relevance_score: number
}

interface ScanResult {
  scan_status: string
  total_listings_found: number
  job_listings_count: number
  apartment_listings_count: number
  email_sent: boolean
  email_recipient: string
  scan_timestamp: string
  listings: Listing[]
  summary_message: string
}

interface ScanHistoryEntry {
  id: string
  timestamp: string
  result: ScanResult
}

interface Settings {
  keywords: string[]
  locations: string[]
  listingType: 'jobs' | 'apartments' | 'both'
  additionalUrls: string[]
  notificationEmail: string
  frequency: string
}

type NavScreen = 'dashboard' | 'history' | 'settings'

const DEFAULT_SETTINGS: Settings = {
  keywords: [],
  locations: [],
  listingType: 'both',
  additionalUrls: [],
  notificationEmail: '',
  frequency: '0 * * * *',
}

const SAMPLE_LISTINGS: Listing[] = [
  { title: 'Senior Frontend Developer', company: 'TechCorp', location: 'New York, NY', source_url: 'https://linkedin.com/jobs/1', source_name: 'LinkedIn', date_posted: '2026-02-20', listing_type: 'job', snippet: 'Looking for an experienced React developer with 5+ years of experience in building modern web applications.', relevance_score: 0.95 },
  { title: 'Full Stack Engineer', company: 'StartupXYZ', location: 'San Francisco, CA', source_url: 'https://linkedin.com/jobs/2', source_name: 'LinkedIn', date_posted: '2026-02-19', listing_type: 'job', snippet: 'Join our growing team building next-generation SaaS products with React, Node.js, and PostgreSQL.', relevance_score: 0.88 },
  { title: '2BR Apartment in Williamsburg', company: 'Brooklyn Realty', location: 'Brooklyn, NY', source_url: 'https://apartments.com/1', source_name: 'Apartments.com', date_posted: '2026-02-20', listing_type: 'apartment', snippet: 'Spacious 2-bedroom apartment with modern finishes, in-unit laundry, rooftop access. Pet friendly.', relevance_score: 0.92 },
  { title: 'Backend Engineer - Python', company: 'DataFlow Inc', location: 'Remote', source_url: 'https://linkedin.com/jobs/3', source_name: 'LinkedIn', date_posted: '2026-02-18', listing_type: 'job', snippet: 'We need a backend engineer proficient in Python, FastAPI, and PostgreSQL for our data pipeline team.', relevance_score: 0.85 },
  { title: 'Studio Apartment - Upper East Side', company: 'Manhattan Living', location: 'New York, NY', source_url: 'https://streeteasy.com/1', source_name: 'StreetEasy', date_posted: '2026-02-19', listing_type: 'apartment', snippet: 'Charming studio in prime UES location, pet-friendly building with doorman and laundry in basement.', relevance_score: 0.78 },
]

const SAMPLE_SCAN_RESULT: ScanResult = {
  scan_status: 'completed',
  total_listings_found: 5,
  job_listings_count: 3,
  apartment_listings_count: 2,
  email_sent: true,
  email_recipient: 'user@example.com',
  scan_timestamp: '2026-02-20T14:30:00Z',
  listings: SAMPLE_LISTINGS,
  summary_message: 'Found 5 new listings matching your criteria: 3 job listings and 2 apartment listings. Email notification sent to user@example.com.',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAgentResult(result: AIAgentResponse): ScanResult | null {
  if (!result.success) return null
  let data = result?.response?.result as any
  if (!data) return null
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { return null }
  }
  return data as ScanResult
}

function formatTimestamp(ts: string | undefined | null): string {
  if (!ts) return '--'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function timeAgo(ts: string | undefined | null): string {
  if (!ts) return '--'
  try {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return ts
  }
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-2 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-2 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-3 mb-1">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-sm text-sm">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Sub Components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const isJob = type?.toLowerCase() === 'job'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm border ${isJob ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
      {isJob ? <HiOutlineBriefcase className="w-3 h-3" /> : <HiOutlineHome className="w-3 h-3" />}
      {isJob ? 'Job' : 'Apartment'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status?.toLowerCase() === 'completed' || status?.toLowerCase() === 'success'
  const isFailed = status?.toLowerCase() === 'failed' || status?.toLowerCase() === 'error'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm border ${isSuccess ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isFailed ? 'bg-red-50 text-red-700 border-red-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
      {isSuccess ? <HiOutlineCheck className="w-3 h-3" /> : null}
      {status ?? 'unknown'}
    </span>
  )
}

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-sm p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="text-xl font-semibold text-card-foreground leading-tight">{value}</div>
    </div>
  )
}

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('')
  const handleAdd = () => {
    const val = input.trim()
    if (val && !tags.includes(val)) {
      onChange([...tags, val])
    }
    setInput('')
  }
  return (
    <div>
      <div className="flex gap-1 mb-1.5 flex-wrap">
        {Array.isArray(tags) && tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-0.5 text-xs rounded-sm border border-border">
            {tag}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="hover:text-destructive"><HiOutlineX className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          className="flex-1 px-2 py-1.5 text-sm border border-input bg-background rounded-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
        />
        <button onClick={handleAdd} className="px-2 py-1.5 bg-primary text-primary-foreground text-xs rounded-sm hover:opacity-90 flex items-center gap-1">
          <HiOutlinePlus className="w-3 h-3" />Add
        </button>
      </div>
    </div>
  )
}

function AgentStatusPanel({ activeAgentId }: { activeAgentId: string | null }) {
  return (
    <div className="bg-card border border-border rounded-sm p-3 mx-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Agents</h3>
      <div className="space-y-1.5">
        {AGENTS.map((agent) => (
          <div key={agent.id} className="flex items-center gap-2 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeAgentId === agent.id ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
            <div className="min-w-0">
              <div className={`font-medium truncate ${activeAgentId === agent.id ? 'text-foreground' : 'text-muted-foreground'}`}>{agent.name}</div>
              <div className="text-muted-foreground/60 truncate text-[10px]">{agent.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  // ── State ────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<NavScreen>('dashboard')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([])
  const [scanning, setScanning] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [inlineMsg, setInlineMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [sampleMode, setSampleMode] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'jobs' | 'apartments'>('all')

  // Schedule state
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleLogs, setScheduleLogs] = useState<ExecutionLog[]>([])

  // Settings save message
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Hydrate from localStorage ────────────────────────────────────
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('listingRadar_settings')
      if (savedSettings) setSettings(JSON.parse(savedSettings))
      const savedHistory = localStorage.getItem('listingRadar_history')
      if (savedHistory) setScanHistory(JSON.parse(savedHistory))
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  // ── Persist to localStorage ──────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem('listingRadar_history', JSON.stringify(scanHistory)) } catch { /* ignore */ }
  }, [scanHistory, hydrated])

  // ── Load schedule info ──────────────────────────────────────────
  const loadScheduleData = useCallback(async () => {
    setScheduleLoading(true)
    try {
      const schedResult = await listSchedules()
      if (schedResult.success && Array.isArray(schedResult.schedules)) {
        const found = schedResult.schedules.find((s) => s.id === SCHEDULE_ID)
        if (found) setSchedule(found)
        else if (schedResult.schedules.length > 0) setSchedule(schedResult.schedules[0])
      }
      const logsResult = await getScheduleLogs(SCHEDULE_ID, { limit: 5 })
      if (logsResult.success && Array.isArray(logsResult.executions)) {
        setScheduleLogs(logsResult.executions)
      }
    } catch { /* ignore */ }
    setScheduleLoading(false)
  }, [])

  useEffect(() => {
    loadScheduleData()
  }, [loadScheduleData])

  // ── Handle Scan ──────────────────────────────────────────────────
  const handleScan = async () => {
    if (scanning) return
    setScanning(true)
    setActiveAgentId(MANAGER_AGENT_ID)
    setInlineMsg({ type: 'info', text: 'Scanning for listings... This may take a minute.' })

    const kw = settings.keywords.length > 0 ? settings.keywords.join(', ') : 'software engineer, apartment rental'
    const loc = settings.locations.length > 0 ? settings.locations.join(', ') : 'New York'
    const lt = settings.listingType === 'both' ? 'Jobs and Apartments' : settings.listingType === 'jobs' ? 'Jobs' : 'Apartments'
    const urls = settings.additionalUrls.length > 0 ? settings.additionalUrls.join(', ') : ''
    const email = settings.notificationEmail || 'not specified'

    const message = `Scan for listings with the following criteria:\nKeywords: ${kw}\nLocations: ${loc}\nListing Type: ${lt}\nWebsites: LinkedIn${urls ? ', ' + urls : ''}\nNotification Email: ${email}`

    try {
      const result = await callAIAgent(message, MANAGER_AGENT_ID)
      const parsed = parseAgentResult(result)
      if (parsed) {
        const entry: ScanHistoryEntry = {
          id: Date.now().toString(),
          timestamp: parsed.scan_timestamp || new Date().toISOString(),
          result: parsed,
        }
        setScanHistory((prev) => [entry, ...prev])
        const count = parsed.total_listings_found ?? 0
        const emailSent = parsed.email_sent ? ', email sent!' : ''
        setInlineMsg({ type: 'success', text: `Scan complete -- ${count} new listings found${emailSent}` })
      } else {
        setInlineMsg({ type: 'error', text: result?.error || 'Scan returned no data. Please try again.' })
      }
    } catch {
      setInlineMsg({ type: 'error', text: 'Scan failed. Please check your settings and try again.' })
    }
    setScanning(false)
    setActiveAgentId(null)
  }

  // ── Schedule toggle ──────────────────────────────────────────────
  const handleToggleSchedule = async () => {
    if (!schedule) return
    setScheduleLoading(true)
    try {
      if (schedule.is_active) {
        await pauseSchedule(schedule.id)
      } else {
        await resumeSchedule(schedule.id)
      }
      await loadScheduleData()
    } catch { /* ignore */ }
    setScheduleLoading(false)
  }

  // ── Save settings ────────────────────────────────────────────────
  const handleSaveSettings = () => {
    try {
      localStorage.setItem('listingRadar_settings', JSON.stringify(settings))
      setSettingsMsg({ type: 'success', text: 'Settings saved successfully.' })
    } catch {
      setSettingsMsg({ type: 'error', text: 'Failed to save settings.' })
    }
    setTimeout(() => setSettingsMsg(null), 3000)
  }

  // ── Derived data ─────────────────────────────────────────────────
  const latestScan = sampleMode
    ? { id: 'sample', timestamp: SAMPLE_SCAN_RESULT.scan_timestamp, result: SAMPLE_SCAN_RESULT }
    : scanHistory[0] ?? null

  const displayListings = latestScan ? (Array.isArray(latestScan.result?.listings) ? latestScan.result.listings : []) : []

  const displayHistory = sampleMode
    ? [
        { id: 's1', timestamp: '2026-02-20T14:30:00Z', result: SAMPLE_SCAN_RESULT },
        { id: 's2', timestamp: '2026-02-20T13:30:00Z', result: { ...SAMPLE_SCAN_RESULT, total_listings_found: 3, job_listings_count: 2, apartment_listings_count: 1, listings: SAMPLE_LISTINGS.slice(0, 3), scan_timestamp: '2026-02-20T13:30:00Z' } },
        { id: 's3', timestamp: '2026-02-20T12:30:00Z', result: { ...SAMPLE_SCAN_RESULT, total_listings_found: 2, job_listings_count: 1, apartment_listings_count: 1, email_sent: false, listings: SAMPLE_LISTINGS.slice(0, 2), scan_timestamp: '2026-02-20T12:30:00Z' } },
      ]
    : scanHistory

  const filteredHistory = displayHistory.filter((entry) => {
    if (historyFilter === 'all') return true
    const listings = Array.isArray(entry?.result?.listings) ? entry.result.listings : []
    if (historyFilter === 'jobs') return listings.some((l) => l?.listing_type?.toLowerCase() === 'job')
    if (historyFilter === 'apartments') return listings.some((l) => l?.listing_type?.toLowerCase() === 'apartment')
    return true
  })

  // ── Render ───────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans flex flex-col" style={{ lineHeight: '1.3' }}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="bg-card border-b border-border px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <FiRadar className="w-5 h-5 text-primary" />
            <h1 className="text-base font-semibold tracking-tight">ListingRadar</h1>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <span>Sample Data</span>
              <button
                onClick={() => setSampleMode(!sampleMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${sampleMode ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" style={{ transform: sampleMode ? 'translateX(18px)' : 'translateX(2px)' }} />
              </button>
            </label>
            <button onClick={() => setScreen('settings')} className="text-muted-foreground hover:text-foreground transition-colors">
              <HiOutlineCog className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Sidebar ─────────────────────────────────────────── */}
          <nav className="w-52 bg-card border-r border-border flex-shrink-0 flex flex-col py-2">
            {[
              { id: 'dashboard' as NavScreen, label: 'Dashboard', icon: <FiActivity className="w-4 h-4" /> },
              { id: 'history' as NavScreen, label: 'Scan History', icon: <HiOutlineCollection className="w-4 h-4" /> },
              { id: 'settings' as NavScreen, label: 'Settings', icon: <HiOutlineCog className="w-4 h-4" /> },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors text-left ${screen === item.id ? 'bg-primary/10 text-primary border-r-2 border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            <div className="mt-auto">
              <AgentStatusPanel activeAgentId={activeAgentId} />
            </div>
          </nav>

          {/* ── Main Content ────────────────────────────────────── */}
          <main className="flex-1 overflow-y-auto p-4">

            {/* ═══════════ Dashboard Screen ═══════════ */}
            {screen === 'dashboard' && (
              <div className="max-w-5xl mx-auto space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Dashboard</h2>
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {scanning ? (
                      <><HiOutlineRefresh className="w-4 h-4 animate-spin" />Scanning...</>
                    ) : (
                      <><HiOutlineSearch className="w-4 h-4" />Scan Now</>
                    )}
                  </button>
                </div>

                {/* Inline Message */}
                {inlineMsg && (
                  <div className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm border ${inlineMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : inlineMsg.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
                    {inlineMsg.type === 'success' && <HiOutlineCheck className="w-4 h-4 flex-shrink-0" />}
                    {inlineMsg.type === 'info' && <HiOutlineRefresh className="w-4 h-4 flex-shrink-0 animate-spin" />}
                    <span className="flex-1">{inlineMsg.text}</span>
                    <button onClick={() => setInlineMsg(null)} className="text-current opacity-50 hover:opacity-100"><HiOutlineX className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {/* Metric Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard
                    label="Last Scan"
                    value={latestScan ? timeAgo(latestScan.timestamp) : '--'}
                    icon={<HiOutlineClock className="w-4 h-4" />}
                  />
                  <MetricCard
                    label="Listings Found"
                    value={latestScan?.result?.total_listings_found ?? 0}
                    icon={<HiOutlineSearch className="w-4 h-4" />}
                  />
                  <MetricCard
                    label="Total Scans"
                    value={sampleMode ? 3 : scanHistory.length}
                    icon={<FiActivity className="w-4 h-4" />}
                  />
                  <MetricCard
                    label="Emails Sent"
                    value={sampleMode ? 2 : scanHistory.filter((s) => s?.result?.email_sent).length}
                    icon={<HiOutlineMail className="w-4 h-4" />}
                  />
                </div>

                {/* Scan Status Banner */}
                {scanning && (
                  <div className="bg-blue-50 border border-blue-200 rounded-sm p-3 flex items-center gap-2 text-sm text-blue-800">
                    <HiOutlineRefresh className="w-4 h-4 animate-spin flex-shrink-0" />
                    <span>Scanning in progress... The manager agent is coordinating web scanning and notification.</span>
                  </div>
                )}

                {/* Summary Message */}
                {latestScan?.result?.summary_message && !scanning && (
                  <div className="bg-card border border-border rounded-sm p-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Latest Scan Summary</h3>
                    {renderMarkdown(latestScan.result.summary_message)}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">Status: <StatusBadge status={latestScan.result.scan_status} /></span>
                      <span>Jobs: {latestScan.result.job_listings_count ?? 0}</span>
                      <span>Apartments: {latestScan.result.apartment_listings_count ?? 0}</span>
                      {latestScan.result.email_sent && <span>Email: {latestScan.result.email_recipient ?? '--'}</span>}
                      {latestScan.result.scan_timestamp && <span>Time: {formatTimestamp(latestScan.result.scan_timestamp)}</span>}
                    </div>
                  </div>
                )}

                {/* Recent Listings Table */}
                <div className="bg-card border border-border rounded-sm">
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Recent Listings</h3>
                    <span className="text-xs text-muted-foreground">{displayListings.length} listing{displayListings.length !== 1 ? 's' : ''}</span>
                  </div>
                  {displayListings.length === 0 ? (
                    <div className="p-8 text-center">
                      <HiOutlineSearch className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground mb-1">No scans yet -- configure your filters and run your first scan!</p>
                      <button onClick={() => setScreen('settings')} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                        <HiOutlineCog className="w-3 h-3" />Go to Settings
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="text-left px-3 py-1.5 font-medium">Title</th>
                            <th className="text-left px-3 py-1.5 font-medium">Type</th>
                            <th className="text-left px-3 py-1.5 font-medium">Source</th>
                            <th className="text-left px-3 py-1.5 font-medium">Location</th>
                            <th className="text-left px-3 py-1.5 font-medium">Posted</th>
                            <th className="text-left px-3 py-1.5 font-medium">Score</th>
                            <th className="text-left px-3 py-1.5 font-medium w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayListings.slice(0, 10).map((listing, idx) => (
                            <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2">
                                <div className="font-medium text-foreground leading-tight">{listing?.title ?? '--'}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{listing?.company ?? ''}</div>
                              </td>
                              <td className="px-3 py-2"><TypeBadge type={listing?.listing_type ?? ''} /></td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{listing?.source_name ?? '--'}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{listing?.location ?? '--'}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{listing?.date_posted ?? '--'}</td>
                              <td className="px-3 py-2 text-xs">
                                {listing?.relevance_score != null ? (
                                  <span className={`font-medium ${(listing.relevance_score ?? 0) >= 0.9 ? 'text-emerald-600' : (listing.relevance_score ?? 0) >= 0.7 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                                    {Math.round((listing.relevance_score ?? 0) * 100)}%
                                  </span>
                                ) : '--'}
                              </td>
                              <td className="px-3 py-2">
                                {listing?.source_url && (
                                  <a href={listing.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:opacity-70">
                                    <HiOutlineExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Listing Snippets */}
                {displayListings.length > 0 && (
                  <div className="bg-card border border-border rounded-sm p-3">
                    <h3 className="text-sm font-semibold mb-2">Listing Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {displayListings.slice(0, 6).map((listing, idx) => (
                        <div key={idx} className="border border-border rounded-sm p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">{listing?.title ?? '--'}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{listing?.company ?? ''}{listing?.location ? ` - ${listing.location}` : ''}</div>
                            </div>
                            <TypeBadge type={listing?.listing_type ?? ''} />
                          </div>
                          {listing?.snippet && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{listing.snippet}</p>}
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">{listing?.source_name ?? ''} {listing?.date_posted ? `| ${listing.date_posted}` : ''}</span>
                            {listing?.source_url && (
                              <a href={listing.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:opacity-70 text-xs inline-flex items-center gap-0.5">
                                View <HiOutlineExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Schedule Management ──────────────────────────── */}
                <div className="bg-card border border-border rounded-sm">
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <HiOutlineCalendar className="w-4 h-4" />
                      Automated Schedule
                    </h3>
                    {schedule && (
                      <button
                        onClick={handleToggleSchedule}
                        disabled={scheduleLoading}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm border transition-colors disabled:opacity-50 ${schedule.is_active ? 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                      >
                        {schedule.is_active ? <><HiOutlinePause className="w-3 h-3" />Pause</> : <><HiOutlinePlay className="w-3 h-3" />Resume</>}
                      </button>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    {schedule ? (
                      <>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                          <div>
                            <span className="text-muted-foreground">Status: </span>
                            <span className={`font-medium ${schedule.is_active ? 'text-emerald-600' : 'text-yellow-600'}`}>
                              {schedule.is_active ? 'Active' : 'Paused'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Frequency: </span>
                            <span className="font-medium">{cronToHuman(schedule.cron_expression)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Timezone: </span>
                            <span className="font-medium">{schedule.timezone ?? 'America/New_York'}</span>
                          </div>
                          {schedule.next_run_time && (
                            <div>
                              <span className="text-muted-foreground">Next run: </span>
                              <span className="font-medium">{formatTimestamp(schedule.next_run_time)}</span>
                            </div>
                          )}
                          {schedule.last_run_at && (
                            <div>
                              <span className="text-muted-foreground">Last run: </span>
                              <span className="font-medium">{timeAgo(schedule.last_run_at)}</span>
                            </div>
                          )}
                        </div>

                        {/* Recent Execution Logs */}
                        {scheduleLogs.length > 0 && (
                          <div className="mt-2">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Recent Executions</h4>
                            <div className="space-y-1">
                              {scheduleLogs.slice(0, 5).map((log) => (
                                <div key={log.id} className="flex items-center justify-between text-xs border border-border rounded-sm px-2 py-1">
                                  <span className="text-muted-foreground">{formatTimestamp(log.executed_at)}</span>
                                  <span className={`font-medium ${log.success ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {log.success ? 'Success' : 'Failed'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground py-2">
                        {scheduleLoading ? (
                          <span className="inline-flex items-center gap-1.5"><HiOutlineRefresh className="w-3 h-3 animate-spin" />Loading schedule...</span>
                        ) : 'No schedule information available.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════ Scan History Screen ═══════════ */}
            {screen === 'history' && (
              <div className="max-w-5xl mx-auto space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Scan History</h2>
                  <div className="flex items-center gap-1.5 text-xs">
                    <HiOutlineFilter className="w-3.5 h-3.5 text-muted-foreground" />
                    {(['all', 'jobs', 'apartments'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setHistoryFilter(f)}
                        className={`px-2 py-1 rounded-sm border text-xs font-medium transition-colors ${historyFilter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'}`}
                      >
                        {f === 'all' ? 'All' : f === 'jobs' ? 'Jobs' : 'Apartments'}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredHistory.length === 0 ? (
                  <div className="bg-card border border-border rounded-sm p-8 text-center">
                    <HiOutlineCollection className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No scan history yet. Run a scan from the Dashboard to see results here.</p>
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="text-left px-3 py-1.5 font-medium w-8"></th>
                          <th className="text-left px-3 py-1.5 font-medium">Scan Time</th>
                          <th className="text-left px-3 py-1.5 font-medium">Listings Found</th>
                          <th className="text-left px-3 py-1.5 font-medium">Email Sent</th>
                          <th className="text-left px-3 py-1.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistory.map((entry) => {
                          const isExpanded = expandedHistoryId === entry.id
                          const entryListings = Array.isArray(entry?.result?.listings) ? entry.result.listings : []
                          return (
                            <React.Fragment key={entry.id}>
                              <tr
                                className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                                onClick={() => setExpandedHistoryId(isExpanded ? null : entry.id)}
                              >
                                <td className="px-3 py-2 text-muted-foreground">
                                  {isExpanded ? <HiOutlineChevronUp className="w-3.5 h-3.5" /> : <HiOutlineChevronDown className="w-3.5 h-3.5" />}
                                </td>
                                <td className="px-3 py-2 text-xs">{formatTimestamp(entry.timestamp)}</td>
                                <td className="px-3 py-2">
                                  <span className="font-medium">{entry?.result?.total_listings_found ?? 0}</span>
                                  <span className="text-xs text-muted-foreground ml-1">({entry?.result?.job_listings_count ?? 0}J / {entry?.result?.apartment_listings_count ?? 0}A)</span>
                                </td>
                                <td className="px-3 py-2">
                                  {entry?.result?.email_sent ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-sm">
                                      <HiOutlineCheck className="w-3 h-3" />Sent
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">--</span>
                                  )}
                                </td>
                                <td className="px-3 py-2"><StatusBadge status={entry?.result?.scan_status ?? 'unknown'} /></td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-muted/20">
                                  <td colSpan={5} className="px-3 py-3">
                                    {entry?.result?.summary_message && (
                                      <div className="mb-3 p-2 border border-border rounded-sm bg-card">{renderMarkdown(entry.result.summary_message)}</div>
                                    )}
                                    {entry?.result?.email_recipient && (
                                      <div className="mb-2 text-xs text-muted-foreground">Notification sent to: <span className="font-medium text-foreground">{entry.result.email_recipient}</span></div>
                                    )}
                                    {entryListings.length > 0 ? (
                                      <div className="space-y-1.5">
                                        {entryListings.map((listing, idx) => (
                                          <div key={idx} className="flex items-start justify-between gap-2 border border-border rounded-sm p-2 bg-card">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-sm">{listing?.title ?? '--'}</span>
                                                <TypeBadge type={listing?.listing_type ?? ''} />
                                              </div>
                                              <div className="text-xs text-muted-foreground mt-0.5">
                                                {listing?.company ?? ''}{listing?.location ? ` - ${listing.location}` : ''} {listing?.source_name ? `(${listing.source_name})` : ''}
                                              </div>
                                              {listing?.snippet && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{listing.snippet}</p>}
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              {listing?.relevance_score != null && (
                                                <span className="text-xs font-medium text-muted-foreground">{Math.round((listing.relevance_score ?? 0) * 100)}%</span>
                                              )}
                                              {listing?.source_url && (
                                                <a href={listing.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:opacity-70" onClick={(e) => e.stopPropagation()}>
                                                  <HiOutlineExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">No listings in this scan.</p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════ Settings Screen ═══════════ */}
            {screen === 'settings' && (
              <div className="max-w-2xl mx-auto space-y-4">
                <h2 className="text-lg font-semibold">Settings</h2>

                {settingsMsg && (
                  <div className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm border ${settingsMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                    {settingsMsg.type === 'success' && <HiOutlineCheck className="w-4 h-4" />}
                    <span>{settingsMsg.text}</span>
                  </div>
                )}

                {/* Search Criteria */}
                <div className="bg-card border border-border rounded-sm p-3 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <HiOutlineSearch className="w-4 h-4" />
                    Search Criteria
                  </h3>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Keywords</label>
                    <TagInput
                      tags={Array.isArray(settings.keywords) ? settings.keywords : []}
                      onChange={(t) => setSettings((prev) => ({ ...prev, keywords: t }))}
                      placeholder="e.g. software engineer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Locations</label>
                    <TagInput
                      tags={Array.isArray(settings.locations) ? settings.locations : []}
                      onChange={(t) => setSettings((prev) => ({ ...prev, locations: t }))}
                      placeholder="e.g. New York, NY"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Listing Type</label>
                    <div className="flex gap-1">
                      {(['jobs', 'apartments', 'both'] as const).map((lt) => (
                        <button
                          key={lt}
                          onClick={() => setSettings((prev) => ({ ...prev, listingType: lt }))}
                          className={`px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors ${settings.listingType === lt ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'}`}
                        >
                          {lt === 'jobs' ? 'Jobs' : lt === 'apartments' ? 'Apartments' : 'Both'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Websites */}
                <div className="bg-card border border-border rounded-sm p-3 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <HiOutlineExternalLink className="w-4 h-4" />
                    Websites
                  </h3>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-sm border border-primary/20 font-medium">
                      <HiOutlineCheck className="w-3 h-3" />
                      LinkedIn (always included)
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Additional URLs</label>
                    <TagInput
                      tags={Array.isArray(settings.additionalUrls) ? settings.additionalUrls : []}
                      onChange={(t) => setSettings((prev) => ({ ...prev, additionalUrls: t }))}
                      placeholder="e.g. apartments.com"
                    />
                  </div>
                </div>

                {/* Notifications */}
                <div className="bg-card border border-border rounded-sm p-3 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <HiOutlineMail className="w-4 h-4" />
                    Notifications
                  </h3>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Email Address</label>
                    <input
                      type="email"
                      className="w-full px-2 py-1.5 text-sm border border-input bg-background rounded-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={settings.notificationEmail}
                      onChange={(e) => setSettings((prev) => ({ ...prev, notificationEmail: e.target.value }))}
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                {/* Schedule */}
                <div className="bg-card border border-border rounded-sm p-3 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <HiOutlineCalendar className="w-4 h-4" />
                    Schedule
                  </h3>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Frequency</label>
                    <select
                      className="w-full px-2 py-1.5 text-sm border border-input bg-background rounded-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={settings.frequency}
                      onChange={(e) => setSettings((prev) => ({ ...prev, frequency: e.target.value }))}
                    >
                      <option value="*/15 * * * *">Every 15 minutes</option>
                      <option value="*/30 * * * *">Every 30 minutes</option>
                      <option value="0 * * * *">Every hour</option>
                      <option value="0 */6 * * *">Every 6 hours</option>
                      <option value="0 9 * * *">Daily at 9 AM</option>
                    </select>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Timezone: America/New_York (configured in schedule)
                  </div>
                </div>

                <button
                  onClick={handleSaveSettings}
                  className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                >
                  <HiOutlineCheck className="w-4 h-4" />
                  Save Settings
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
