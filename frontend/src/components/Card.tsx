import { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'

interface CardProps {
  children: ReactNode
  style?: CSSProperties
  className?: string
}

export default function Card({ children, style }: CardProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 20,
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--text-muted)',
      marginBottom: 12,
    }}>
      {children}
    </div>
  )
}
