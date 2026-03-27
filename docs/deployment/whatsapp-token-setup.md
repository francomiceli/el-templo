# WhatsApp Permanent System User Token Setup

## Why This Is Needed

Development tokens generated from the Meta Graph API Explorer **expire after 24 hours**. Production requires a **permanent token** created via a System User in Meta Business Manager. This token does not expire and can be revoked/rotated at any time.

---

## Prerequisites

Before starting, ensure you have:

- [ ] **Admin access** to Meta Business Manager (business.facebook.com)
- [ ] A registered **Meta App** with the WhatsApp product added
- [ ] A **WhatsApp Business Account** linked to the Meta App

---

## Step-by-Step: Generate the Token

1. Go to [Meta Business Manager](https://business.facebook.com) > **Business Settings**

2. In the left sidebar, navigate to **Users** > **System Users**

3. Click **Add** to create a new System User
   - **Name:** `el-templo-bot`
   - **Role:** Admin

4. Click on the created System User (`el-templo-bot`)

5. Click **Add Assets**
   - Select **Apps** > choose the El Templo Meta App > toggle **Full Control**
   - Select **WhatsApp Accounts** > choose the WhatsApp Business Account > toggle **Full Control**
   - Click **Save Changes**

6. Click **Generate New Token**

7. Select the **Meta App** (El Templo's app) from the dropdown

8. Select the required permissions:
   - `whatsapp_business_messaging` -- send and receive messages
   - `whatsapp_business_management` -- manage phone numbers and templates

9. Click **Generate Token**

10. **COPY THE TOKEN IMMEDIATELY** -- it is shown only once. If you lose it, you must generate a new one.

---

## Store the Token

### Production (GitHub Actions)

Add the token as a GitHub Secret named `WHATSAPP_TOKEN`:

1. GitHub repo > **Settings** > **Secrets and variables** > **Actions**
2. **New repository secret**
3. Name: `WHATSAPP_TOKEN`
4. Value: paste the token
5. Click **Add secret**

The deploy workflow injects this token into both the API and bot `.env.production` files. It takes effect on the next deploy.

### Local Development

Add the token to both local `.env` files:

```
# el-templo-api/.env
WHATSAPP_TOKEN=your_permanent_token_here

# el-templo-bot/.env
WHATSAPP_TOKEN=your_permanent_token_here
```

---

## Token Properties

- **Does not expire** (unlike Graph API Explorer tokens)
- **Can be revoked** from Business Manager at any time
- **Scoped** to the WhatsApp Business Account and selected permissions
- **Works with** the existing `WHATSAPP_PHONE_ID` -- no changes needed
- **Shared** between API (admin takeover sends) and bot (webhook responses)

---

## Token Rotation

If the token is compromised or needs rotation:

1. Go to Business Manager > **Business Settings** > **Users** > **System Users**
2. Click on `el-templo-bot`
3. Find the existing token and click **Revoke**
4. Click **Generate New Token** (repeat steps 7-10 above)
5. Update the `WHATSAPP_TOKEN` GitHub Secret with the new value
6. The next deploy propagates the new token automatically -- no SSH required

---

## Troubleshooting

| Error                                                               | Cause                                                                    | Fix                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `Invalid OAuth access token`                                        | Token expired (Graph API Explorer token) or revoked                      | Generate a new permanent token following the steps above                                              |
| `Permission denied` or `(#10) Application does not have permission` | Missing `whatsapp_business_messaging` permission                         | Regenerate token with the correct permissions selected                                                |
| `System User not found`                                             | System User in wrong Business Manager account                            | Verify you are in the correct Business Manager that owns the WhatsApp Business Account                |
| `Phone number not found`                                            | `WHATSAPP_PHONE_ID` does not match the token's WhatsApp Business Account | Check that the phone number belongs to the same WhatsApp Business Account assigned to the System User |
| `Message failed to send` but no auth error                          | Typically a template or recipient issue, not a token problem             | Check message format, recipient phone number, and template approval status                            |
