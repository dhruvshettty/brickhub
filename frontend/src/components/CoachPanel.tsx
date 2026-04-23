import { useState, useRef, useEffect } from 'react'
import { Send, Lock, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { sendCoachMessage, getCoachHistory, applyPlanChange, CoachMessage, PlanChange } from '../lib/api'

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

interface PlanChangeDiffProps {
  change: PlanChange
  onConfirm: () => void
  onDismiss: () => void
  applying: boolean
}

function PlanChangeDiff({ change, onConfirm, onDismiss, applying }: PlanChangeDiffProps) {
  return (
    <div style={{
      marginTop: 10,
      background: 'var(--bg)',
      border: '1px solid var(--accent)',
      borderRadius: 8,
      overflow: 'hidden',
      fontSize: 12,
    }}>
      <div style={{
        background: 'rgba(99,102,241,0.12)',
        padding: '8px 12px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        color: 'var(--accent)',
      }}>
        PROPOSED PLAN CHANGES
      </div>

      <div style={{ padding: '10px 12px' }}>
        {change.changes.map(c => (
          <div key={c.date} style={{
            marginBottom: 10,
            paddingBottom: 10,
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              {formatDate(c.date)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 20px 1fr', gap: 6, alignItems: 'center' }}>
              {/* Before */}
              <div style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6,
                padding: '6px 8px',
                opacity: 0.8,
              }}>
                {c.original_session ? (
                  <>
                    <div style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'line-through' }}>
                      {capitalize(c.original_session.type)}
                    </div>
                    {(c.original_session.distance_km ?? 0) > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                        {c.original_session.distance_km} km
                      </div>
                    )}
                    {c.original_session.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, textDecoration: 'line-through' }}>
                        {c.original_session.description}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</div>
                )}
              </div>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>→</div>
              {/* After */}
              <div style={{
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 6,
                padding: '6px 8px',
              }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{capitalize(c.new_session.type)}</div>
                {c.new_session.distance_km > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.new_session.distance_km} km</div>
                )}
                {c.new_session.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.new_session.description}</div>
                )}
              </div>
            </div>
          </div>
        ))}

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          {change.reason}
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onConfirm}
            disabled={applying}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: applying ? 'not-allowed' : 'pointer',
              opacity: applying ? 0.6 : 1,
            }}
          >
            <Check size={12} />
            {applying ? 'Applying...' : 'Apply change'}
          </button>
          <button
            onClick={onDismiss}
            disabled={applying}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

interface MessageWithChange extends CoachMessage {
  pendingChange?: PlanChange | null
  changeApplied?: boolean
}

export default function CoachPanel({
  locked,
  onPlanChanged,
}: {
  locked?: boolean
  onPlanChanged?: () => void
}) {
  const [messages, setMessages] = useState<MessageWithChange[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getCoachHistory().then(setMessages).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    setLoading(true)

    const userMsg: MessageWithChange = { id: Date.now(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await sendCoachMessage(text)
      const assistantMsg: MessageWithChange = {
        id: Date.now() + 1,
        role: 'assistant',
        content: res.ai_unavailable
          ? res.response + '\n\n(AI unavailable — check your API key in .env)'
          : res.response,
        pendingChange: res.plan_change ?? null,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Coach unavailable right now. Run `make logs` to check the backend.',
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleApplyChange = async (msgId: number, change: PlanChange) => {
    setApplying(true)
    try {
      await applyPlanChange({ reason: change.reason, changes: change.changes })
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, pendingChange: null, changeApplied: true } : m
      ))
      onPlanChanged?.()
    } catch {
      alert('Failed to apply the plan change. Please try again.')
    } finally {
      setApplying(false)
    }
  }

  const handleDismissChange = (msgId: number) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, pendingChange: null } : m
    ))
  }

  if (locked) {
    return (
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 340,
        gap: 12,
        color: 'var(--text-muted)',
      }}>
        <Lock size={24} strokeWidth={1.5} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>AI Coach</div>
        <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
          Set up your running plan to unlock the AI coach.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      display: 'flex',
      flexDirection: 'column',
      height: 340,
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
      }}>
        AI Coach
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Ask me anything about your training. "Should I do my long run tomorrow?" or "I'm exhausted, adjust my week."
          </p>
        )}
        {messages.map(msg => (
          <div key={msg.id} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
          }}>
            <div style={{
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--border)',
              color: 'var(--text)',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 13,
              lineHeight: 1.5,
            }}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: '0 0 6px' }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                    em: ({ children }) => <em>{children}</em>,
                    ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
                    li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                    code: ({ children }) => <code style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 3, padding: '1px 4px', fontSize: 12 }}>{children}</code>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              )}
            </div>

            {/* Plan change diff card */}
            {msg.role === 'assistant' && msg.pendingChange && (
              <PlanChangeDiff
                change={msg.pendingChange}
                onConfirm={() => handleApplyChange(msg.id, msg.pendingChange!)}
                onDismiss={() => handleDismissChange(msg.id)}
                applying={applying}
              />
            )}
            {msg.role === 'assistant' && msg.changeApplied && (
              <div style={{
                marginTop: 8,
                fontSize: 11,
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <Check size={11} /> Plan updated
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: 13 }}>
            Thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask your coach..."
          style={{ flex: 1 }}
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius)',
            color: 'white',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            opacity: !input.trim() || loading ? 0.5 : 1,
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
