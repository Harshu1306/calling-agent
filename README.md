# 📞 AquaPure AI Calling Agent

An AI-powered voice calling agent designed to automate the initial sales conversation for **commercial RO water purification systems**.

The agent can talk to customers, understand their requirements, collect important details, save the conversation transcript, and generate an AI-based call summary.

## ✨ Features

- 🤖 AI-powered two-way voice conversation
- 📞 Real phone calls using Twilio
- 🧠 Gemini-powered conversation understanding
- 📝 Call transcript storage
- 📊 AI-generated call summary and lead status
- 🗄️ PostgreSQL database
- 🖥️ Next.js admin dashboard
- 🌐 Browser-based calling support
- 🔐 Twilio webhook verification

## 🛠️ Tech Stack

- **Frontend:** Next.js, Tailwind CSS
- **Backend:** Python, FastAPI
- **AI:** Google Gemini
- **Database:** PostgreSQL, SQLAlchemy
- **Telephony:** Twilio
- **Speech-to-Text:** Twilio Speech Recognition / faster-whisper
- **Text-to-Speech:** Twilio / gTTS
- **Tunnel:** ngrok

## 🔄 System Flow

```text
                    ┌─────────────────┐
                    │    Customer     │
                    │     Phone       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Twilio      │
                    │ Phone & Speech  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     FastAPI     │
                    │     Backend     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Gemini      │
                    │   AI Agent      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   AI Response   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Twilio      │
                    │  Speaks Reply   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Customer     │
                    └─────────────────┘

              ┌──────────────────────────┐
              │       PostgreSQL         │
              │                          │
              │ • Customer details      │
              │ • Call records          │
              │ • Transcripts           │
              │ • Call summaries        │
              └──────────────────────────┘
```

### 🔁 Conversation Flow

1. Admin enters the customer's phone number.
2. FastAPI creates a call record and requests Twilio to make the call.
3. Twilio calls the customer.
4. The customer speaks to the AI agent.
5. Speech is converted into text.
6. FastAPI sends the text and conversation history to Gemini.
7. Gemini understands the customer's response and generates the next response.
8. Twilio converts the response into speech and plays it to the customer.
9. The conversation continues until the required information is collected.
10. The transcript is saved in PostgreSQL.
11. After the call ends, Gemini generates a summary and lead status.
12. The admin can view the call details from the dashboard.

## 🌐 Browser Mode Flow

For browser-based calls:

```text
Browser Microphone
       ↓
    FastAPI
       ↓
faster-whisper
       ↓
     Gemini
       ↓
      gTTS
       ↓
Browser Speakers
```

This mode allows the agent to be tested without making an actual phone call.

## 🚀 Setup

### 1. Create Database

```sql
CREATE DATABASE ro_calling_agent;
```

### 2. Start Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
DATABASE_URL=postgresql://postgres:password@localhost:5432/ro_calling_agent
CALLING_MODE=browser
```

Start the backend:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend: `http://localhost:8000`

API Docs: `http://localhost:8000/docs`

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard: `http://localhost:3000`

## 📞 Real Phone Calls

Set:

```env
CALLING_MODE=twilio
```

Add:

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number
TWILIO_WEBHOOK_URL=your_ngrok_url
```

Start ngrok:

```bash
ngrok http 8000
```

Copy the generated HTTPS URL into `TWILIO_WEBHOOK_URL` and restart the backend.

Then use **Start AI Call** from the dashboard.

## 💬 Example

**AI:** Hello! I'm Priya from AquaPure Commercial RO Systems. Are you looking for a commercial RO system?

**Customer:** Within the next month.

**AI:** Perfect. Just to confirm — you need a 500 LPH commercial RO system for your hotel in Bangalore, with a budget of ₹1,00,000 and you plan to purchase within a month. Is that correct?

**Customer:** Yes, that's right.

**AI:** Wonderful! We have excellent solutions for hotel applications. Our team will prepare a customized quote for you. Thank you for your time, and we'll be in touch soon!

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/calls/start` | Start a new call session |
| POST | `/calls/{id}/message` | Send customer message, get AI response |
| POST | `/calls/{id}/end` | End call, generate summary |
| GET | `/calls/{id}/audio` | Get TTS audio for text |
| GET | `/calls` | List all calls (with filters) |
| GET | `/calls/{id}` | Get call details + transcript + summary |
| GET | `/dashboard/stats` | Get dashboard statistics |
| GET | `/health` | Health check |

### Filter Parameters for GET /calls

- `status` — completed, failed, active, etc.
- `lead_status` — interested, not_interested, maybe, etc.
- `follow_up` — true/false
- `customer_name` — partial name search
- `outcome` — sale_prospect, not_interested, etc.
- `date_from` — ISO date string
- `date_to` — ISO date string
- `page` — page number (default: 1)
- `page_size` — results per page (default: 20)

---

## 🧠 AI Agent Details

### LLM Used
- **Google Gemini 1.5 Flash** via `google-generativeai` Python package
- Free tier: 15 requests/minute, 1 million tokens/day
- Get API key: https://aistudio.google.com

### How the Agent Works
1. Maintains conversation history
2. Tracks extracted customer information
3. Returns structured JSON with response + extracted info + next action
4. Never asks for information already provided
5. Adapts dynamically to conversation flow

### Structured Response Format
```json
{
  "response": "What capacity are you looking for?",
  "customer_intent": "interested",
  "extracted_information": {
    "name": "Rahul Kumar",
    "requirement": "Commercial RO System",
    "capacity": null,
    "location": "Bangalore",
    "application": "Hotel",
    "budget": "100000",
    "timeline": null
  },
  "next_action": "ask_capacity",
  "call_should_end": false
}
```

---

## 🗄️ Database Schema

```sql
-- customers: stores customer information
-- calls: stores call records with status and lead info
-- transcripts: stores every message with speaker and timestamp
-- call_summaries: stores AI-generated summary and extracted requirements
```

Tables are auto-created on backend startup via SQLAlchemy.

---

## 🔊 Speech Technology

### Speech-to-Text (STT)
- **Technology:** Web Speech API (browser built-in)
- **Cost:** Completely FREE — no API key
- **Limitation:** Chrome/Edge work best; Firefox has limited support
- **Language:** English (India) — `en-IN`

### Text-to-Speech (TTS)
- **Primary:** gTTS (Google Text-to-Speech) — server-side, FREE, no API key
- **Fallback:** Web Speech API SpeechSynthesis (browser built-in)
- **Format:** MP3 audio streamed as base64

---

## 📞 Calling Modes

### Browser Mode (Default, Free)
- Uses browser microphone and speaker
- No real phone call
- Perfect for development and demo
- Set `CALLING_MODE=browser` in `.env`

### Twilio Mode (Optional, Paid)
To add real phone calling later:
1. Get a Twilio account at twilio.com
2. Set `CALLING_MODE=twilio` in `.env`
3. Fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
4. The AI agent code does not need to change — only the calling layer

---

## 🚨 Error Handling

| Scenario | Handling |
|----------|----------|
| Customer silence | Prompt after 8s, end after second silence |
| STT failure | Show error, retry or end call gracefully |
| LLM/API failure | Fallback response, record error |
| LLM JSON error | Safe fallback, continue conversation |
| Call disconnect | Save transcript collected so far |
| Backend down | Frontend shows clear error message |

---

## 📁 Project Structure

```text
calling_agent/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── ai_agent.py
│   ├── speech.py
│   └── calling.py
│
├── frontend/
│   ├── app/
│   ├── components/
│   └── lib/
│
└── README.md
```

---

## 🆓 Free Tier Limitations

| Service | Free Limit |
|---------|-----------|
| Gemini 1.5 Flash | 15 RPM, 1M tokens/day |
| gTTS | Unlimited (uses Google Translate TTS) |
| Web Speech API | Unlimited (browser built-in) |
| PostgreSQL | Unlimited (self-hosted) |

All features work within the free tier for development and demo purposes.

---

## 🔧 Optional: Adding Real Telephony

The `calling.py` module provides a clean interface. To add Twilio:

1. `pip install twilio`
2. Set `CALLING_MODE=twilio` in `.env`
3. Fill in Twilio credentials
4. The AI agent, transcript, and summary logic remain unchanged

For other providers (Plivo, Vonage, etc.), implement a new class following the same `start_call()`, `end_call()`, `get_call_status()` interface in `calling.py`.
