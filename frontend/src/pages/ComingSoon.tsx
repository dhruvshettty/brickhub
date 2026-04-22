interface Props {
  module: string
  milestone: string
}

export default function ComingSoon({ module, milestone }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      gap: 12,
      color: 'var(--text-muted)',
    }}>
      <div style={{ fontSize: 48 }}>🔧</div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>{module}</h2>
      <p style={{ fontSize: 14 }}>Coming in {milestone}. Building running first to nail the plan logic.</p>
    </div>
  )
}
