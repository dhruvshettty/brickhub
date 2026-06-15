import { Heading } from '../components/Type'

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
      <Heading level={2} style={{ color: 'var(--text)' }}>{module}</Heading>
      <p style={{ fontSize: 14 }}>Coming in {milestone}.</p>
      <a
        href="https://github.com/dhruvshettty/brickhub"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 13, color: 'var(--accent)' }}
      >
        Follow progress or contribute on GitHub →
      </a>
    </div>
  )
}
