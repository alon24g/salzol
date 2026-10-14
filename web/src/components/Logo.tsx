/** A shopping basket with a coin: the app's mark (also public/favicon.svg). */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="12" fill="#047857" />
      <path d="M9 17h22l-2.4 11.2a2 2 0 0 1-2 1.6H13.4a2 2 0 0 1-2-1.6Z" fill="#fff" />
      <path d="M14 17l4-7M26 17l-4-7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 21.5v4.5M20 21.5v4.5M24 21.5v4.5" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="31" cy="11" r="6" fill="#f59e0b" stroke="#047857" strokeWidth="1.5" />
      <path d="M29.2 11h3.6M31 9.2v3.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
