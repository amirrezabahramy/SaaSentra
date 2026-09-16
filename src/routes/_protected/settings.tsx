import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { settingsQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'

export const Route = createFileRoute('/_protected/settings')({
  loader: ({ context }) => context.queryClient.query(settingsQuery()),
  component: Settings,
})
function Settings() {
  const { LL } = useI18nContext()
  const { data } = useSuspenseQuery(settingsQuery())
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {LL.settings.kicker()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">
          {LL.settings.title()}
        </h1>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-(--line) bg-(--surface) p-6">
          <h2 className="font-serif text-2xl font-bold">
            {LL.settings.teamMembers()}
          </h2>
          <div className="mt-4 divide-y divide-(--line)">
            {data.members.map((member) => (
              <div key={member.id} className="py-3">
                <p className="font-semibold">
                  {member.user.name ?? member.user.email}
                </p>
                <p className="text-sm text-(--sea-ink-soft)">
                  {member.user.email} · {member.role} · {member.tenant.name}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-(--line) bg-(--surface) p-6">
          <h2 className="font-serif text-2xl font-bold">
            {LL.settings.environment()}
          </h2>
          <p className="mt-2 text-sm text-(--sea-ink-soft)">
            {LL.settings.environmentDescription()}
          </p>
          <div className="mt-4 space-y-2">
            {data.env.map((item) => (
              <div
                key={item.name}
                className="flex justify-between rounded-xl bg-white/50 px-4 py-2 text-sm"
              >
                <code>{item.name}</code>
                <span
                  className={
                    item.configured ? 'text-emerald-700' : 'text-amber-700'
                  }
                >
                  {item.configured
                    ? LL.settings.configured()
                    : LL.settings.missing()}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
