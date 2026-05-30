import * as React from 'react'
import { render } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = "bimyahcards"
const SENDER_DOMAIN = "notify.playbimyah.com"
const FROM_DOMAIN = "playbimyah.com"
const TEMPLATE_NAME = "whitelist"

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254
}

export const Route = createFileRoute("/api/public/send-whitelist-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !supabaseServiceKey) {
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }

        let recipientEmail: string
        try {
          const body = await request.json()
          recipientEmail = String(body.email ?? '').trim().toLowerCase()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }

        if (!isValidEmail(recipientEmail)) {
          return Response.json({ error: 'Invalid email' }, { status: 400 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const messageId = crypto.randomUUID()

        // Suppression check
        const { data: suppressed } = await supabase
          .from('suppressed_emails')
          .select('id')
          .eq('email', recipientEmail)
          .maybeSingle()

        if (suppressed) {
          return Response.json({ success: false, reason: 'email_suppressed' })
        }

        // Unsubscribe token (get or create)
        let unsubscribeToken: string
        const { data: existingToken } = await supabase
          .from('email_unsubscribe_tokens')
          .select('token, used_at')
          .eq('email', recipientEmail)
          .maybeSingle()

        if (existingToken && !existingToken.used_at) {
          unsubscribeToken = existingToken.token
        } else if (!existingToken) {
          unsubscribeToken = generateToken()
          await supabase
            .from('email_unsubscribe_tokens')
            .upsert(
              { token: unsubscribeToken, email: recipientEmail },
              { onConflict: 'email', ignoreDuplicates: true }
            )
          const { data: storedToken } = await supabase
            .from('email_unsubscribe_tokens')
            .select('token')
            .eq('email', recipientEmail)
            .maybeSingle()
          if (!storedToken) {
            return Response.json({ error: 'Failed to prepare email' }, { status: 500 })
          }
          unsubscribeToken = storedToken.token
        } else {
          return Response.json({ success: false, reason: 'email_suppressed' })
        }

        const template = TEMPLATES[TEMPLATE_NAME]
        if (!template) {
          return Response.json({ error: 'Template missing' }, { status: 500 })
        }

        const element = React.createElement(template.component, {})
        const html = await render(element)
        const plainText = await render(element, { plainText: true })
        const resolvedSubject =
          typeof template.subject === 'function' ? template.subject({}) : template.subject

        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: TEMPLATE_NAME,
          recipient_email: recipientEmail,
          status: 'pending',
        })

        const { error: enqueueError } = await supabase.rpc('enqueue_email', {
          queue_name: 'transactional_emails',
          payload: {
            message_id: messageId,
            to: recipientEmail,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: resolvedSubject,
            html,
            text: plainText,
            purpose: 'transactional',
            label: TEMPLATE_NAME,
            idempotency_key: `whitelist-${recipientEmail}`,
            unsubscribe_token: unsubscribeToken,
            queued_at: new Date().toISOString(),
          },
        })

        if (enqueueError) {
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: TEMPLATE_NAME,
            recipient_email: recipientEmail,
            status: 'failed',
            error_message: 'Failed to enqueue email',
          })
          return Response.json({ error: 'Failed to enqueue email' }, { status: 500 })
        }

        return Response.json({ success: true, queued: true })
      },
    },
  },
})
