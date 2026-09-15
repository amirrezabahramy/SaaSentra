export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/40 p-10 text-center">
      <h3 className="font-semibold text-[var(--sea-ink)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">{description}</p>
    </div>
  )
}
