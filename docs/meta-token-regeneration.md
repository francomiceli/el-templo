# Meta WhatsApp Token Regeneration

Temporary access tokens from the Meta Developers console expire every 24 hours. When the bot starts returning 401 errors from the WhatsApp Cloud API, regenerate the token using the steps below.

## Symptoms

- Bot logs show `WhatsApp API error: 401` or `OAuthException: Session has expired`
- No outbound messages reach users
- Webhook receives inbound messages normally but replies fail silently or with 401

## Short-term fix (dev / testing)

1. Open https://developers.facebook.com/apps/ and select the El Templo Bot app.
2. Navigate to **WhatsApp → API Setup**.
3. Under **Temporary access token**, click the regenerate button. The new token is valid for 24 hours.
4. Copy the token.
5. Update `WHATSAPP_ACCESS_TOKEN` in `~/el-templo/el-templo-bot/.env`:
   ```
   WHATSAPP_ACCESS_TOKEN=EAAG...new-token-here
   ```
6. Restart the bot:
   ```bash
   pkill -f "tsx watch"
   cd ~/el-templo/el-templo-bot
   pnpm dev
   ```
7. Verify the bot responds to a test message.

## Permanent fix (production, v5.4 deploy task)

Temporary tokens are a dev-only workflow. For production, generate a permanent **System User** token via Business Manager:

1. Open https://business.facebook.com/settings/system-users
2. Create a new System User (or select an existing one).
3. Assign the WhatsApp Business Account to the System User with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
4. Generate a token with never-expires option. Copy and store securely.
5. Set as `WHATSAPP_ACCESS_TOKEN` in the production environment (EC2 / secrets manager).

Tracked as a v5.4 deploy-readiness task.

## Related env vars

- `WHATSAPP_ACCESS_TOKEN` — the token being regenerated here
- `WHATSAPP_PHONE_NUMBER_ID` — stable, does not expire
- `WHATSAPP_VERIFY_TOKEN` — webhook verification, does not expire
- `WHATSAPP_APP_SECRET` — for signature validation, does not expire
