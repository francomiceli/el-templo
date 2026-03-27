# WhatsApp Business Phone Number Registration

This document describes the process for registering a phone number with WhatsApp Business Platform so the bot can send and receive messages in production.

## Prerequisites

- Meta Business account verified at [business.facebook.com](https://business.facebook.com)
- WhatsApp Business Platform app created at [developers.facebook.com](https://developers.facebook.com)
- A phone number that is **NOT** currently registered with WhatsApp (personal or business)
- The phone number must be able to receive SMS or voice calls for verification

## Registration Steps

1. Go to **Meta Business Manager > WhatsApp Manager > Phone Numbers**
2. Click **Add Phone Number**
3. Enter the phone number with country code (e.g., `+54` for Argentina)
4. Choose verification method: SMS or voice call
5. Enter the verification code received
6. The number is now registered as a WhatsApp Business number

## Post-Registration Configuration

1. Set the **display name** (e.g., "El Templo")
2. Set the **business profile**:
   - Description
   - Address
   - Website
   - Profile photo
3. Copy the **Phone Number ID** from the WhatsApp Manager dashboard -- this becomes the `WHATSAPP_PHONE_ID` environment variable
4. Note: the number can no longer be used with the regular WhatsApp app

## Environment Variable Mapping

| Env Var                 | Source                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `WHATSAPP_PHONE_ID`     | Phone Number ID from WhatsApp Manager dashboard                             |
| `WHATSAPP_TOKEN`        | System User permanent token (see `docs/deployment/whatsapp-token-setup.md`) |
| `WHATSAPP_VERIFY_TOKEN` | Any random string you choose for webhook verification                       |

## Important Warnings

- Once registered, the phone number is **permanently tied** to the WhatsApp Business Platform. You cannot use it with the regular WhatsApp app anymore.
- For testing, use the **Meta-provided test number** available in the app dashboard under WhatsApp > API Setup. This avoids consuming a real number.
- The production phone number should be a **dedicated business line** -- do not use a personal number.
- If you need to change phone numbers later, the old number must be deregistered first (which may take up to 30 days).
