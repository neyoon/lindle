interface Props {
  size?: number
}

export function BrandMark({ size = 22 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="3.5" x2="12" y2="20.5" strokeWidth="1.1" />
      <polygon points="12,3.5 13.8,6 12,8.2 10.2,6" strokeWidth="1.4" />
      <polygon points="12,15.8 13.8,18 12,20.5 10.2,18" strokeWidth="1.4" />
      <g strokeWidth="0.9" opacity="0.55">
        <line x1="9.2" y1="9.8" x2="14.8" y2="9.8" />
        <line x1="9.2" y1="11.2" x2="14.8" y2="11.2" />
        <line x1="9.2" y1="12.6" x2="14.8" y2="12.6" />
        <line x1="9.2" y1="14" x2="14.8" y2="14" />
      </g>
      <line
        x1="5"
        y1="18.5"
        x2="19"
        y2="5.5"
        strokeWidth="1.4"
        style={{ stroke: 'var(--rust)' }}
      />
    </svg>
  )
}
