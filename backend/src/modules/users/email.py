"""Branded tenant invitation email delivery through the Resend Python SDK."""

import html
import logging

from fastapi import HTTPException

from src.core.config import settings

logger = logging.getLogger(__name__)


class UserEmailService:
    @staticmethod
    def ensure_configured() -> None:
        missing = [
            name
            for name, value in (
                ("RESEND_API_KEY", settings.RESEND_API_KEY),
                ("RESEND_FROM_EMAIL", settings.RESEND_FROM_EMAIL),
            )
            if not value
        ]
        if missing:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Invitation email delivery is not configured. Set these backend .env values: "
                    + ", ".join(missing)
                    + "."
                ),
            )

    def send_temporary_password(
        self,
        *,
        email: str,
        full_name: str | None,
        temporary_password: str,
        reset_url: str,
        idempotency_key: str,
    ) -> None:
        self.ensure_configured()
        try:
            import resend
            from resend.exceptions import ResendError
        except ImportError as exc:
            logger.exception("Resend SDK is unavailable")
            raise HTTPException(
                status_code=503,
                detail="Resend SDK is not installed. Run `uv sync` in the backend directory.",
            ) from exc
        safe_name = html.escape(full_name.strip()) if full_name and full_name.strip() else "there"
        safe_email = html.escape(email, quote=True)
        safe_password = html.escape(temporary_password, quote=True)
        safe_url = html.escape(reset_url, quote=True)
        resend.api_key = settings.RESEND_API_KEY
        params = {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [email],
            "subject": "Your TOFAA Gifting OS account is ready",
            "html": f"""<!doctype html>
<html lang="en"><body style="margin:0;background:#f4f2ed;font-family:Arial,Helvetica,sans-serif;color:#202b27">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;background:#f4f2ed"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="padding:24px 36px;background:#173c34;color:white;font-size:20px;font-weight:bold;letter-spacing:1px">TOFAA</td></tr>
<tr><td style="padding:36px">
<p style="margin:0 0 12px;color:#997342;font-size:12px;font-weight:bold;letter-spacing:1.5px">ACCOUNT INVITATION</p>
<h1 style="margin:0 0 18px;color:#173c34;font-size:27px">Your account is ready</h1>
<p style="font-size:15px;line-height:1.7">Hello {safe_name}, use these credentials to open the password reset flow.</p>
<p style="margin:18px 0 8px;font-size:13px;color:#66716c">ACCOUNT EMAIL</p>
<p style="margin:0 0 18px;padding:14px 16px;background:#f4f2ed;border-radius:8px;font-size:15px;font-weight:bold;word-break:break-word">{safe_email}</p>
<p style="margin:18px 0 8px;font-size:13px;color:#66716c">TEMPORARY PASSWORD</p>
<p style="margin:0;padding:14px 16px;background:#f4f2ed;border-radius:8px;font-family:monospace;font-size:16px;font-weight:bold;word-break:break-all">{safe_password}</p>
<p style="margin:16px 0 24px;color:#66716c;font-size:13px;line-height:1.6">This temporary password only lets you reach password reset. You must choose a new password before accessing tenant features.</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#173c34" style="border-radius:7px">
<a href="{safe_url}" style="display:inline-block;padding:15px 24px;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:1px">RESET PASSWORD</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#66716c;font-size:12px;line-height:1.6">The reset link expires in one hour and can be used once. If you weren’t expecting this account, contact your administrator.</p>
<p style="margin:16px 0 0;color:#66716c;font-size:12px;line-height:1.6">If the button doesn’t work, copy this link into your browser:<br><a href="{safe_url}" style="color:#173c34;word-break:break-all">{safe_url}</a></p>
</td></tr><tr><td style="padding:18px 36px;background:#f8f7f4;color:#7b837f;font-size:11px">TOFAA Gifting OS · Account security email</td></tr>
</table></td></tr></table></body></html>""",
        }
        options = {"idempotency_key": idempotency_key}
        try:
            resend.Emails.send(params, options)
        except ResendError as exc:
            logger.exception("Resend failed to deliver tenant invitation")
            if "domain is not verified" in str(exc).lower():
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Resend rejected the sender address. Verify its domain in Resend and set "
                        "RESEND_FROM_EMAIL to an address on that verified domain."
                    ),
                ) from exc
            raise HTTPException(
                status_code=503,
                detail="Resend could not deliver the invitation email. Check the Resend account and sender configuration.",
            ) from exc
        except ValueError as exc:
            logger.exception("Invalid Resend invitation email payload")
            raise HTTPException(status_code=503, detail="Invitation email payload is invalid.") from exc


user_email_service = UserEmailService()
