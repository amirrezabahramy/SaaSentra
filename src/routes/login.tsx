import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { signIn } from '#/lib/auth.functions'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const navigate = useNavigate()
  const signInFn = useServerFn(signIn)
  const signInMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      signInFn({ data }),
    onSuccess: () => navigate({ to: '/' }),
  })
  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      signInMutation.reset()
      try {
        await signInMutation.mutateAsync(value)
      } catch {
        // The mutation error is rendered below without changing the layout.
      }
    },
    validators: {
      onSubmit: ({ value }) =>
        !value.email || !value.password
          ? 'Email and password are required'
          : undefined,
    },
  })

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
        className="w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-3xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Use your SaaS dashboard account.
          </p>
        </div>
        <form.Field name="email">
          {(field) => (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                required
                type="email"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </label>
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Password</span>
              <input
                required
                minLength={8}
                type="password"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </label>
          )}
        </form.Field>
        {signInMutation.isError ? (
          <p className="text-sm text-red-600">Invalid email or password</p>
        ) : null}
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting || signInMutation.isPending}
              className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {isSubmitting || signInMutation.isPending
                ? 'Signing in…'
                : 'Sign in'}
            </button>
          )}
        </form.Subscribe>
      </form>
    </main>
  )
}
