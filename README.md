# 📞 AquaPure AI Calling Agent

**An AI voice agent that sells Commercial RO (Reverse Osmosis) water purification systems, qualifies leads, and summarizes every call.**

"Priya", the AI sales agent, holds a natural two-way voice conversation with a prospect through the browser, pulls out their requirements (capacity, location, budget, timeline), saves the transcript live, and produces a structured summary for the sales team.




## Table of Contents

- Features
- How It Works
- Tech Stack
- Quick Start
- Configuration
- Using the Voice Call
- Example Conversation
- API Reference
- Agent Response Format
- Database Schema
- Project Structure
- Error Handling
- Troubleshooting
- Free Tier Limits
- Roadmap

---

## ✨ Features

- **Two-way voice conversation** using the browser microphone and speakers
- **Context-aware AI agent** (Google Gemini) that understands natural speech and never re-asks for information already given
- **Live transcripts** saved to PostgreSQL turn by turn during the call
- **AI call summaries** with structured customer requirements and lead status
- **Admin dashboard** with stats, filterable call list, and call detail pages
- **Runs on free tiers**: no paid subscription needed for development or demos
- **Pluggable calling layer**: swap browser calls for Twilio, Plivo, or Vonage without touching the agent logic

---

## 🧭 How It Works

```
 Browser (Next.js)  ── mic audio ──►  FastAPI backend
        ▲                                  │
        │                                  ├─► faster-whisper   (speech → text)
        │                                  ├─► Gemini agent     (reply + extracted info)
        │                                  ├─► gTTS             (text → speech)
        │                                  └─► PostgreSQL       (calls, transcripts, summaries)
        └──────── MP3 reply (base64) ◄─────┘
```

1. The customer speaks; the browser records the audio.
2. The backend transcribes it and passes it, with the full conversation history, to Gemini.
3. Gemini returns structured JSON: the spoken reply, detected intent, extracted details, and the next action.
4. The reply is converted to MP3 and played back in the browser.
5. When the call ends, Gemini generates the final summary and lead classification.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|---|
| Frontend | Next.js 14, Tailwind CSS |
| Backend | Python, FastAPI, Uvicorn | 
| LLM | Google Gemini (free tier) | 
| Speech-to-Text | faster-whisper (runs locally) 
| Text-to-Speech | gTTS (fallback: browser SpeechSynthesis) 
| Database | PostgreSQL + SQLAlchemy 
| Telephony (optional) | Twilio 

---

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- PostgreSQL
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com)
- Chrome or Edge recommended (best microphone support)

### 1. Create the database

```sql
CREATE DATABASE ro_calling_agent;
```

Tables are created automatically on first backend startup.

### 2. Start the backend

```bash
cd backend
python -m venv venv

# macOS / Linux
source venv/bin/activate
# Windows
venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env` (see [Configuration](#-configuration)), then run:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard: http://localhost:3000

---

## ⚙️ Configuration

**`backend/.env`**

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Your Google Gemini API key |
| `DATABASE_URL` | ✅ | e.g. `postgresql://postgres:password@localhost:5432/ro_calling_agent` |
| `CALLING_MODE` | ✅ | `browser` (default) or `twilio` |
| `TWILIO_ACCOUNT_SID` | Twilio only | From your Twilio console |
| `TWILIO_AUTH_TOKEN` | Twilio only | From your Twilio console |
| `TWILIO_PHONE_NUMBER` | Twilio only | Your Twilio number |

**`frontend/.env.local`**

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> ⚠️ Never commit `.env` files. Make sure they are listed in `.gitignore`.

---

## 🎤 Using the Voice Call

1. Open http://localhost:3000
2. Click **Start AI Call**
3. *(Optional)* Enter the customer's name and phone number
4. Confirm in the modal and **allow microphone access**
5. Wait for Priya to finish her greeting
6. Speak naturally and describe your requirements
7. Priya replies through your speakers; the conversation continues until complete
8. Click **End Call**
9. Review the transcript and AI summary on the call detail page

**Tips:** use headphones to prevent the agent's voice feeding back into the mic, and speak after the greeting ends.

---

## 🗣 Example Conversation

> **Priya:** Hello! I'm Priya calling from AquaPure Commercial RO Systems. Are you looking for a water purification system for your business?
>
> **Customer:** Yes, I need a commercial RO system for my hotel in Bangalore. 500 LPH capacity, budget around one lakh.
>
> **Priya:** That's great! A 500 LPH system would work well for a hotel. What's your purchase timeline: are you looking to install this soon?
>
> **Customer:** Within the next month.
>
> **Priya:** Perfect. Just to confirm: a 500 LPH commercial RO system for your hotel in Bangalore, budget of ₹1,00,000, purchase within a month. Is that correct?
>
> **Customer:** Yes, that's right.
>
> **Priya:** Wonderful! Our team will prepare a customized quote for you. Thank you for your time, and we'll be in touch soon!

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/calls/start` | Start a new call session |
| `POST` | `/calls/{id}/message` | Send a customer message, get the AI response |
| `POST` | `/calls/{id}/end` | End the call and generate the summary |
| `GET` | `/calls/{id}/audio` | Get TTS audio for a piece of text |
| `GET` | `/calls` | List calls (supports filters below) |
| `GET` | `/calls/{id}` | Call details, transcript, and summary |
| `GET` | `/dashboard/stats` | Dashboard statistics |
| `GET` | `/health` | Health check |

### Filters for `GET /calls`

| Parameter | Example values |
|---|---|
| `status` | `completed`, `failed`, `active` |
| `lead_status` | `interested`, `not_interested`, `maybe` |
| `follow_up` | `true` / `false` |
| `customer_name` | partial name search |
| `outcome` | `sale_prospect`, `not_interested` |
| `date_from`, `date_to` | ISO date strings |
| `page` | default `1` |
| `page_size` | default `20` |

Full interactive documentation is available at `/docs` while the backend is running.

---

## 🧠 Agent Response Format

On every turn the agent returns structured JSON, which keeps extraction reliable and lets the UI react to the next action:

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

The agent keeps the full conversation history, tracks what it already knows, and falls back to a safe response if the model returns malformed JSON.

---

## 🗄 Database Schema

| Table | Purpose |
|---|---|
| `customers` | Customer details |
| `calls` | Call records with status and lead info |
| `transcripts` | Every message with speaker and timestamp |
| `call_summaries` | AI summary and extracted requirements |

Managed with SQLAlchemy; tables are auto-created at startup.

---

## 📁 Project Structure

```
calling_agent/
├── backend/
│   ├── main.py            # FastAPI app and endpoints
│   ├── database.py        # SQLAlchemy setup
│   ├── models.py          # Database models
│   ├── schemas.py         # Pydantic schemas
│   ├── ai_agent.py        # Gemini agent logic
│   ├── speech.py          # Speech-to-text and gTTS text-to-speech
│   ├── calling.py         # Calling service (browser / Twilio)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Dashboard
│   │   ├── calls/
│   │   │   ├── page.tsx        # Call list with filters
│   │   │   └── [id]/page.tsx   # Call detail
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── VoiceCallModal.tsx  # Voice calling interface
│   ├── lib/
│   │   └── api.ts              # API helpers
│   └── .env.local
└── README.md
```

---

## 🚨 Error Handling

| Scenario | Behavior |
|---|---|
| Customer silence | Prompt after 8s; end the call after a second silence |
| Speech recognition failure | Show an error, retry or end gracefully |
| LLM / API failure | Fallback response; error recorded |
| Malformed LLM JSON | Safe fallback; conversation continues |
| Call disconnect | Transcript collected so far is saved |
| Backend down | Frontend shows a clear error message |

---

## ☎️ Adding Real Phone Calls (Twilio)

The agent, transcript, and summary logic don't change; only the calling layer does.

```bash
pip install twilio
```

Then in `.env`:

```
CALLING_MODE=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
```

For other providers (Plivo, Vonage, etc.), add a class in `calling.py` implementing `start_call()`, `end_call()`, and `get_call_status()`.

---

## 🩺 Troubleshooting

| Problem | Fix |
|---|---|
| Empty or silent transcription | Check the browser has mic permission and the correct input device; confirm the recording isn't empty before it is sent; try Chrome or Edge |
| `429` / quota errors from Gemini | You've hit the free-tier rate limit; wait a minute or reduce request frequency |
| Model not found error | Set a currently available Gemini model in `ai_agent.py` (older model names get retired) |
| Database connection refused | Verify PostgreSQL is running and `DATABASE_URL` credentials are correct |
| Frontend can't reach backend | Check `NEXT_PUBLIC_API_URL` and that the backend is on port 8000 |
| No audio playback | Interact with the page first (browsers block autoplay); check speaker output |

---

## 🆓 Free Tier Limits

| Service | Limit |
|---|---|
| Gemini API | Rate-limited per minute and per day; check [Google AI Studio](https://aistudio.google.com) for current quotas |
| gTTS | Unofficial Google Translate endpoint; fine for demos, not guaranteed for production |
| faster-whisper | Runs locally; limited only by your hardware |
| PostgreSQL | Self-hosted, unlimited |

---

## 🗺 Roadmap

- [ ] Authentication for the admin dashboard
- [ ] Real telephony via Twilio
- [ ] Multi-language support (Hindi, Kannada, Tamil)
- [ ] CRM / WhatsApp follow-up integration
- [ ] Docker Compose for one-command setup

---

## 📄 License

Add your license here (e.g. MIT).
