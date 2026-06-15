import { CSSProperties, ReactNode } from 'react'

// Typed type-scale primitives. Encodes brickhub's working heading scale
// (tighter than Linear's marketing scale — appropriate for a dashboard) with
// the system's weight cap (600) and negative display tracking. New UI should
// use these instead of ad-hoc inline fontSize/fontWeight. See DESIGN.md.

type HeadingLevel = 1 | 2 | 3

const HEADING: Record<HeadingLevel, CSSProperties> = {
  1: { fontSize: 24, fontWeight: 600, letterSpacing: '-0.6px', lineHeight: 1.2 },
  2: { fontSize: 20, fontWeight: 600, letterSpacing: '-0.4px', lineHeight: 1.25 },
  3: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', lineHeight: 1.3 },
}

export function Heading({
  level = 1,
  children,
  style,
}: {
  level?: HeadingLevel
  children: ReactNode
  style?: CSSProperties
}) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
  return <Tag style={{ ...HEADING[level], ...style }}>{children}</Tag>
}

type TextVariant = 'body' | 'sm' | 'caption'

const TEXT: Record<TextVariant, CSSProperties> = {
  body: { fontSize: 14, lineHeight: 1.5 },
  sm: { fontSize: 13, lineHeight: 1.5 },
  caption: { fontSize: 12, lineHeight: 1.4 },
}

export function Text({
  variant = 'body',
  muted = false,
  mono = false,
  children,
  style,
}: {
  variant?: TextVariant
  muted?: boolean
  mono?: boolean
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      className={mono ? 'mono' : undefined}
      style={{ ...TEXT[variant], color: muted ? 'var(--text-muted)' : undefined, ...style }}
    >
      {children}
    </div>
  )
}

// Big monospace metric number (paces, distances, stat values).
export function Metric({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="mono" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', ...style }}>
      {children}
    </span>
  )
}
