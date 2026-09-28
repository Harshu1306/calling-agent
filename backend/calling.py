import os
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
        try:
            from twilio.rest import Client
            self.client = Client(
                os.getenv("TWILIO_ACCOUNT_SID"),
                os.getenv("TWILIO_AUTH_TOKEN")
            )
            self.from_number = os.getenv("TWILIO_PHONE_NUMBER")
        except ImportError:
            raise ImportError("Install twilio package: pip install twilio")
    
    def start_call(self, customer_phone: str, customer_name: str = None) -> dict:
        """Start a real phone call via Twilio."""
        # Validate phone number format
        if not customer_phone or not customer_phone.startswith("+"):
            raise ValueError("Phone number must be in E.164 format: +1234567890")
        
        call = self.client.calls.create(
            to=customer_phone,
            from_=self.from_number,
            url=os.getenv("TWILIO_WEBHOOK_URL", "http://your-server.com/twilio/voice")
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
