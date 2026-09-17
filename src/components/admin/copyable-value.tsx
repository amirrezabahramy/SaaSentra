import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export function CopyableValue({
  value,
  label,
}: {
  value: string
  label: string
}) {
  const [copied, setCopied] = useState(false)

  async function copyValue() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-(--line) bg-white/60 px-2 py-1.5 dark:bg-black/10">
      <code className="min-w-0 flex-1 break-all font-mono text-xs font-semibold text-(--sea-ink)">
        {value}
      </code>
      <button
        type="button"
        onClick={() => void copyValue()}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-(--line) px-2 py-1 text-xs font-semibold"
        aria-label={copied ? 'Copied' : label}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : label}
      </button>
    </div>
  )
}
