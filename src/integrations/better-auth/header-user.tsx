import { useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { signOut } from '#/lib/auth.functions'
import { useI18nContext } from '#/i18n/i18n-react'

export type OperatorIdentity = {
  name: string
  role: string
  image?: string | null
}

export default function BetterAuthHeader({ user }: { user: OperatorIdentity }) {
  const signOutFn = useServerFn(signOut)
  const signOutMutation = useMutation({
    mutationFn: () => signOutFn(),
    onSuccess: () => window.location.reload(),
  })
  const { LL } = useI18nContext()

  return (
    <div className="flex items-center gap-3">
      {user.image ? (
        <img src={user.image} alt="" className="h-10 w-10 rounded-full" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {user.name.charAt(0).toUpperCase() || 'U'}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-(--sea-ink)">
          {user.name}
        </p>
        <p className="text-xs text-(--sea-ink-soft)">
          {user.role === 'OWNER' ? LL.auth.owner() : LL.auth.admin()}
        </p>
      </div>
      <button
        onClick={() => void signOutMutation.mutateAsync()}
        disabled={signOutMutation.isPending}
        className="h-9 shrink-0 border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:bg-neutral-800"
      >
        {LL.auth.signOut()}
      </button>
    </div>
  )
}
