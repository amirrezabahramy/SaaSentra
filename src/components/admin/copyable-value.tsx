import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export function CopyableValue({
  value,
  label,
  copiedLabel,
}: {
  value: string
  label: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  async function copyValue() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <span className="mt-2 inline-flex max-w-full items-center gap-1.5">
      <code className="max-w-full break-all rounded border border-(--line) px-2 py-1 font-mono text-xs font-semibold text-(--sea-ink)">
        {value}
      </code>
      <button
        type="button"
        onClick={() => void copyValue()}
        className="inline-flex shrink-0 items-center rounded-md border border-(--line) p-1.5 text-(--sea-ink-soft)"
        aria-label={copied ? copiedLabel : label}
        title={copied ? copiedLabel : label}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </span>
  )
}
