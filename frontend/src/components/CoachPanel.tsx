import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { sendCoachMessage, getCoachHistory, CoachMessage } from '../lib/api'

export default function CoachPanel() {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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

    const userMsg: CoachMessage = { id: Date.now(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await sendCoachMessage(text)
      const assistantMsg: CoachMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: res.ai_unavailable
          ? res.response + '\n\n(AI unavailable — check your API key in .env)'
          : res.response,
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
            maxWidth: '80%',
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
