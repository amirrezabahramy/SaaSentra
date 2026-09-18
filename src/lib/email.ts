import nodemailer from 'nodemailer'
import { env } from '#/env'

export function isEmailConfigured(): boolean {
  const hasAuthentication = Boolean(env.SMTP_USER || env.SMTP_PASSWORD)
  const hasCompleteAuthentication = Boolean(env.SMTP_USER && env.SMTP_PASSWORD)
  return Boolean(
    env.SMTP_HOST &&
    (env.SMTP_FROM || env.SMTP_USER) &&
    (!hasAuthentication || hasCompleteAuthentication),
  )
}

export async function sendPaymentEmail(input: {
  to: string
  payload: Record<string, unknown>
}) {
  if (!isEmailConfigured()) {
    throw new Error('SMTP email delivery is not configured')
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  })
  const planName = String(input.payload.planName ?? '—')
  const tenantName = String(input.payload.tenantName ?? '—')
  const serialKey = input.payload.serialKey
    ? String(input.payload.serialKey)
    : null
  const periodEnd = input.payload.periodEnd
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(String(input.payload.periodEnd)))
    : 'Permanent access'
  const paymentId = String(input.payload.paymentId ?? '—')
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>'"]|\\u2028|\\u2029/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;',
          '\\u2028': '&#8232;',
          '\\u2029': '&#8233;',
        })[character] ?? character,
    )
  const textLines = [
    'Your payment was completed successfully.',
    '',
    `Plan: ${planName}`,
    `Tenant: ${tenantName}`,
    `Access until: ${periodEnd}`,
    ...(serialKey ? [`Serial key: ${serialKey}`] : []),
    `Payment reference: ${paymentId}`,
  ]
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:12px 0;color:#64748b;font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:12px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
    </tr>`
  const html = `
    <div style="margin:0;background:#f8fafc;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">
        <div style="background:#0f3d4c;padding:28px 32px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.75;">SaaS Management</div>
          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;">Payment completed</h1>
        </div>
        <div style="padding:28px 32px;">
          <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">Your payment was received successfully. Your service access has been updated.</p>
          <table style="width:100%;border-collapse:collapse;">${row('Tenant', tenantName)}${row('Plan', planName)}${row('Access until', periodEnd)}${serialKey ? row('Serial key', serialKey) : ''}${row('Payment reference', paymentId)}</table>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">If you did not make this payment, please contact the service administrator.</p>
        </div>
      </div>
    </div>`

  await transporter.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to: input.to,
    subject: 'Payment completed',
    text: textLines.join('\n'),
    html,
  })
}
