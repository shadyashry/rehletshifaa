# Meta WhatsApp Cloud API test setup

The backend supports a direct Meta test adapter without committing Meta credentials. Local Mailpit
simulation remains the default until `WHATSAPP_MODE=meta` is explicitly enabled.

## Meta dashboard

1. Create a Meta developer app and add the WhatsApp product.
2. In **WhatsApp > API Setup**, add the intended test recipient and copy the temporary access
   token and test phone number ID.
3. In **WhatsApp > Configuration**, set the callback URL to:

   `https://<current-backend-tunnel>/api/v1/public/webhooks/whatsapp/meta`

4. Set a long random verify token in Meta and use the identical value for
   `WHATSAPP_META_VERIFY_TOKEN`.
5. Subscribe the webhook to the `messages` field. The endpoint validates Meta's GET challenge and
   verifies every POST using `X-Hub-Signature-256` and the Meta app secret.

## Local environment

Set these in the shell or an uncommitted local environment file before recreating the backend:

```text
WHATSAPP_MODE=meta
WHATSAPP_META_PHONE_NUMBER_ID=<test phone number id>
WHATSAPP_META_ACCESS_TOKEN=<temporary access token>
WHATSAPP_META_VERIFY_TOKEN=<your random verify token>
WHATSAPP_META_APP_SECRET=<Meta app secret>
WHATSAPP_META_AUTH_TEMPLATE=<approved authentication template name>
WHATSAPP_META_AUTH_TEMPLATE_LANGUAGE=en_US
```

Then rebuild with the required tunnel overlay:

```text
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up --build -d backend
```

The callback must be updated when the Cloudflare quick-tunnel hostname changes.

## Testing notes

- Meta's temporary token and test sender are not production credentials.
- A test recipient must first be registered in the Meta dashboard.
- Free-form link notifications are normally allowed only in the customer-service conversation
  window and need an approved utility template for business-initiated production delivery.
- When `WHATSAPP_META_AUTH_TEMPLATE` is set, six-digit OTP notifications use that approved
  authentication template. Its body and URL-button parameters must both accept the code. If it is
  unset, the test adapter sends text, which works only inside an open conversation window.
- The outbox `DELIVERED` state means Meta accepted the API request. Later Meta receipts are stored in
  `provider_delivery_status` as `SENT`, `DELIVERED`, `READ`, or `FAILED`.
- No webhook payload, phone number, message body, OTP, access token, or app secret is persisted in
  the delivery event table.
