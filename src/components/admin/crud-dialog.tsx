import type { ReactNode } from 'react'

export function CrudDialog({
  title,
  children,
  error,
  onClose,
}: {
  title: string
  children: ReactNode
  error?: ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-(--sea-ink)/35 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-(--line) bg-white p-6 shadow-2xl opacity-100 dark:bg-[#0f1b1f]"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-2xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-(--sea-ink-soft) hover:bg-white/70"
          >
            ×
          </button>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  )
}
