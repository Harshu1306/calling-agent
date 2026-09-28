# AI-Powered Commercial RO Sales & Lead Qualification Calling Agent

A complete full-stack AI calling agent for Commercial RO (Reverse Osmosis) water purification system sales. The AI agent conducts two-way voice conversations with potential customers, qualifies leads, stores transcripts, and generates AI summaries.

---

## 📋 Features

- **Two-way voice conversation** via browser microphone and speaker
- **AI Sales Agent (Priya)** powered by Google Gemini — understands natural speech, extracts info without asking again
- **Real-time transcript** saved to PostgreSQL during the call
- **AI-generated call summary** with structured customer requirements
- **Admin dashboard** with stats, call list, filters, and call detail pages
- **Free to use** — no paid subscription required (Gemini free tier + gTTS)

---

## 🏗️ Architecture

```
Browser (Next.js)
    ↓
FastAPI Backend (Python)
    ↓
Gemini AI Agent (LLM)
    ↓
gTTS (Text-to-Speech) + Web Speech API (Speech-to-Text)
    ↓
PostgreSQL (Database)
```

---

## 🛠️ Technology Stack

| Component | Technology | Cost |
|-----------|-----------|------|
| Frontend | Next.js 14 + Tailwind CSS | Free |
| Backend | Python + FastAPI | Free |
| LLM | Google Gemini 1.5 Flash | Free tier |
| Text-to-Speech | gTTS (Google TTS) | Free |
| Speech-to-Text | Web Speech API (browser) | Free |
| Voice/Calling | Browser (WebRTC + Web Audio) | Free |
| Database | PostgreSQL | Free |
| ORM | SQLAlchemy | Free |

---

## ⚙️ Setup Instructions

### Prerequisites

- Python 3.9+
- Node.js 18+
- PostgreSQL
- Google Gemini API key (free at https://aistudio.google.com)

### 1. Clone and navigate

```bash
cd calling_agent
```

### 2. Set up PostgreSQL

Create the database:

```sql
CREATE DATABASE ro_calling_agent;
```

### 3. Set up Backend

```bash
cd backend
pip install -r requirements.txt
```

Copy the environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_actual_gemini_api_key
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/ro_calling_agent
CALLING_MODE=browser
```

Start the backend:

```bash
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: http://localhost:8000

API documentation: http://localhost:8000/docs

### 4. Set up Frontend

```bash
cd frontend
```

The `.env.local` file is already created with:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Install dependencies and start:

```bash
npm install
npm run dev
```

The dashboard will be at: http://localhost:3000

---

## 🎤 How to Use Browser Voice Mode

1. Open http://localhost:3000
2. Click **"Start AI Call"** button
3. (Optional) Enter customer name and phone
4. Click **"Start AI Call"** in the modal
5. Allow microphone access when prompted
6. The AI (Priya) will greet you — wait for her to finish
7. Speak naturally — describe your RO requirements
8. The AI will respond through your speakers
9. Conversation continues until complete
10. Click **"End Call"** when done
11. View call details, transcript, and AI summary

---

## 🗣️ Example Demo Conversation

**AI:** Hello! I'm Priya calling from AquaPure Commercial RO Systems. Are you looking for a water purification system for your business?

**Customer:** Yes, I need a commercial RO system for my hotel in Bangalore. 500 LPH capacity, budget around one lakh.

**AI:** That's great! A 500 LPH system would work well for a hotel. What's your purchase timeline — are you looking to install this soon?

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

```
calling_agent/
├── backend/
│   ├── main.py          # FastAPI app + all endpoints
│   ├── database.py      # SQLAlchemy setup
│   ├── models.py        # Database models
│   ├── schemas.py       # Pydantic schemas
│   ├── ai_agent.py      # Gemini AI agent logic
│   ├── speech.py        # gTTS text-to-speech
│   ├── calling.py       # Calling service (browser/Twilio)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Dashboard
│   │   ├── calls/
│   │   │   ├── page.tsx       # Calls list with filters
│   │   │   └── [id]/page.tsx  # Call detail page
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── VoiceCallModal.tsx # Voice calling interface
│   ├── lib/
│   │   └── api.ts             # API helper functions
│   └── .env.local
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
