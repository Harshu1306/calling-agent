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

**Customer:** Yes, I need a 500 LPH system for my hotel in Bangalore.

The agent extracts:

```text
Requirement: Commercial RO System
Capacity: 500 LPH
Location: Bangalore
Application: Hotel
```

It then asks for missing information such as budget and purchase timeline.

After the call, the system generates a structured summary for the sales team.

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

## 🔒 Security

- Twilio webhook requests are verified.
- API keys and credentials are stored in `.env`.
- `.env` files should not be committed to GitHub.

## 🚧 Future Improvements

- Admin authentication
- Public deployment without ngrok
- Multi-language support
- CRM and WhatsApp integration
- Additional calling providers

## 📄 License

Add your preferred license here.
