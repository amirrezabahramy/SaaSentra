import type { ReactNode } from 'react'
import { useState } from 'react'
import { useI18nContext } from '#/i18n/i18n-react'

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
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-(--line) bg-white p-6 shadow-2xl opacity-100 dark:bg-[#0f1b1f]"
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

export function PermanentDeleteDialog({
  title,
  onClose,
  onConfirm,
  isPending,
}: {
  title: string
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}) {
  const { LL } = useI18nContext()
  const [value, setValue] = useState('')
  const canDelete = value === 'DELETE'
  return (
    <CrudDialog title={title} onClose={onClose}>
      <p className="mt-5 text-sm text-(--sea-ink-soft)">
        {LL.crud.permanentDeleteWarning()}
      </p>
      <label className="mt-4 block text-sm font-semibold">
        {LL.crud.typeDeleteToConfirm()}
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-2 w-full rounded-xl border border-(--line) bg-white px-4 py-3 dark:bg-[#14262b]"
          autoComplete="off"
        />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold"
        >
          {LL.crud.cancel()}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canDelete || isPending}
          className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {LL.crud.deletePermanently()}
        </button>
      </div>
    </CrudDialog>
  )
}
