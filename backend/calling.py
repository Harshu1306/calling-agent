import os
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
from enum import Enum
from dotenv import load_dotenv

load_dotenv()


class CallMode(Enum):
    BROWSER = "browser"
    TWILIO = "twilio"


class BrowserCallingService:
  
    
    def start_call(self, customer_phone: str = None, customer_name: str = None) -> dict:
        """Simulate starting a browser-based call."""
        return {
            "status": "connected",
            "mode": "browser",
            "message": "Browser call session started. Use microphone to speak.",
            "provider_call_id": None  # No real phone call
        }
    
    def end_call(self, call_id: str = None) -> dict:
        """End the browser-based call."""
        return {
            "status": "ended",
            "mode": "browser"
        }
    
    def get_call_status(self, call_id: str = None) -> str:
        """Get status of browser call - always 'active' since it's browser-managed."""
        return "active"


class TwilioCallingService:
 
    
    def __init__(self):
        account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        self.from_number = os.getenv("TWILIO_PHONE_NUMBER", "").strip()
        self.webhook_url = os.getenv("TWILIO_WEBHOOK_URL", "").strip()

        missing_settings = [
            name for name, value in (
                ("TWILIO_ACCOUNT_SID", account_sid),
                ("TWILIO_AUTH_TOKEN", auth_token),
                ("TWILIO_PHONE_NUMBER", self.from_number),
                ("TWILIO_WEBHOOK_URL", self.webhook_url),
            ) if not value
        ]
        if missing_settings:
            raise ValueError(
                "Twilio mode requires: " + ", ".join(missing_settings)
            )
        if not self.webhook_url.startswith("https://"):
            raise ValueError("TWILIO_WEBHOOK_URL must be a publicly reachable HTTPS URL")

        try:
            from twilio.rest import Client
            self.client = Client(account_sid, auth_token)
        except ImportError:
            raise ImportError("Install twilio package: pip install twilio")
    
    def start_call(self, customer_phone: str, customer_name: str = None, call_id: int = None) -> dict:
        """Start a real phone call via Twilio."""
        # Validate phone number format
        if not customer_phone or not customer_phone.startswith("+"):
            raise ValueError("Phone number must be in E.164 format: +1234567890")
        
        if not self.from_number.startswith("+"):
            raise ValueError("TWILIO_PHONE_NUMBER must be in E.164 format")

        voice_url = urlsplit(self.webhook_url)
        query = dict(parse_qsl(voice_url.query))
        if call_id is not None:
            query["call_id"] = str(call_id)
        call = self.client.calls.create(
            to=customer_phone,
            from_=self.from_number,
            url=urlunsplit((voice_url.scheme, voice_url.netloc, "/twilio/voice", urlencode(query), "")),
            status_callback=urlunsplit((voice_url.scheme, voice_url.netloc, "/twilio/status", urlencode(query), "")),
            status_callback_event=["completed"],
        )
        
        return {
            "status": "dialing",
            "mode": "twilio",
            "provider_call_id": call.sid,
            "message": f"Calling {customer_phone}..."
        }
    
    def end_call(self, provider_call_id: str) -> dict:
        """End a Twilio call."""
        call = self.client.calls(provider_call_id).update(status="completed")
        return {"status": "ended", "mode": "twilio", "provider_call_id": call.sid}
    
    def get_call_status(self, provider_call_id: str) -> str:
        """Get current status of a Twilio call."""
        call = self.client.calls(provider_call_id).fetch()
        return call.status


def get_calling_service():
    """Factory function to get the appropriate calling service based on config."""
    mode = os.getenv("CALLING_MODE", "browser").lower()
    
    if mode == "twilio":
        return TwilioCallingService()
    else:
        return BrowserCallingService()
