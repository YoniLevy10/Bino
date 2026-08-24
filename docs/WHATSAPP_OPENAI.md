# WhatsApp OpenAI conversational layer

Bamakor keeps Meta WhatsApp Cloud API as the transport and the existing deterministic webhook dispatcher as the source of truth for operational side effects.

The OpenAI layer handles only conversational/free-form messages that do not belong to a high-confidence operational flow. It can read limited resident context (recent WhatsApp messages, the resident's project name, and up to five open tickets) and generate a grounded reply. It never creates, closes, assigns, or mutates tickets.

## Why this architecture

The existing WhatsApp flow is reliable for:

- QR / `START_...` flows
- building selection
- new ticket descriptions
- media attachment
- ticket-status keywords
- language selection

Those flows remain deterministic. AI is used for messages such as greetings, thanks, follow-up questions, natural-language questions about an existing ticket, and other conversational messages that previously fell into rigid prompts.

If the AI request fails, times out, returns invalid JSON, is disabled, or has no API key, the message falls back to the existing deterministic dispatcher.

## Environment variables

Set these in Vercel for the environments where the AI assistant should run:

```text
WHATSAPP_AI_ENABLED=true
OPENAI_API_KEY=<server-side OpenAI API key>
WHATSAPP_OPENAI_MODEL=gpt-5.6-luna
```

`WHATSAPP_OPENAI_MODEL` is optional. The default is `gpt-5.6-luna` because WhatsApp support is a high-volume, latency-sensitive workload. A stronger model can be selected later without changing code.

Do not expose `OPENAI_API_KEY` to the browser and do not prefix it with `NEXT_PUBLIC_`.

## Meta 24-hour customer-service window

AI does not remove Meta's WhatsApp messaging rules. A free-form response is allowed when the resident has messaged the business and the customer-service window is open. The AI layer in this implementation runs only from an inbound WhatsApp webhook, so it is used as a direct reply to a resident message.

Proactive outbound messages outside Meta's allowed customer-service window still require an approved WhatsApp template. Existing proactive/template logic should remain in place for those cases.

## Data sent to OpenAI

The request intentionally does not include the resident phone number. Context is limited to what is useful for the conversation:

- tenant/business name
- resolved resident language
- resident name when already known
- project name when already known
- up to five open tickets (number, status, description, created time, assigned worker name)
- up to twelve recent WhatsApp text messages
- the current inbound message

The model is explicitly instructed not to invent ETAs, prices, statuses, promises, manager actions, or building details.

## Request path

```text
Resident WhatsApp message
        ↓
Meta Cloud API webhook
        ↓
/api/webhook/whatsapp
        ↓
Webhook signature + rate limit + tenant resolution + dedupe
        ↓
OpenAI conversational gate
      ↙       ↘
AI reply      continue_flow
  ↓               ↓
Meta text       existing deterministic dispatcher
message          (tickets/buildings/status/media)
```

## Rollout

1. Merge and deploy with `WHATSAPP_AI_ENABLED` unset/false. Behavior should remain unchanged.
2. Add `OPENAI_API_KEY` in Vercel.
3. Set `WHATSAPP_AI_ENABLED=true` in Preview first.
4. Test greetings, thanks, an existing-ticket question, a new-ticket description, a building address, and `START_...`.
5. Enable in Production after verifying that ticket creation and status flows still bypass AI.
