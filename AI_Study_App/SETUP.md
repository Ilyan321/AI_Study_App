# AI Study App — Setup Guide

## Prerequisites
- Python 3.8+
- A Flowise account at https://cloud.flowiseai.com

## Step 1: Get Your Flowise Workflow ID

1. Log in to [Flowise Cloud](https://cloud.flowiseai.com)
2. Create or select your AI workflow
3. Click **Get API URL** or **Deploy**
4. Copy the **Workflow ID** from the URL
   - Example: `abcd1234-efgh-5678-ijkl-mnop9999`

## Step 2: Configure .env File

1. Open `backend/.env`
2. Replace `YOUR_FLOWISE_WORKFLOW_ID` with your actual workflow ID:

```
FLOWISE_API_URL=https://cloud.flowiseai.com/api/v1/prediction/YOUR_WORKFLOW_ID_HERE
FLOWISE_BEARER_TOKEN=  # Optional, leave empty if not needed
PORT=8000
FLOWISE_TIMEOUT=15
LOG_LEVEL=INFO
```

Example:
```
FLOWISE_API_URL=https://cloud.flowiseai.com/api/v1/prediction/a1b2c3d4e5f6-7890-abcd-ef12-345678901234
```

## Step 3: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

## Step 4: Run the Backend Server

```bash
cd backend
python -m uvicorn app:app --host 127.0.0.1 --port 8012 --reload
```

Server will run at: `http://127.0.0.1:8012`

## Step 5: Open the App

Open your browser to: `http://127.0.0.1:8012`

## Troubleshooting

### Error: "FLOWISE_API_URL is not set"
- Make sure `.env` file exists in `backend/` folder
- Make sure it contains a valid `FLOWISE_API_URL`
- Restart the server after changing .env

### Error: "Unable to connect to the Multi-Agent Router"
- Verify your Flowise workflow ID is correct
- Check that your Flowise deployment is active
- Ensure the URL in `.env` is exactly correct

### Enter key not sending messages
- This is fixed in the latest version
- Make sure you're using the latest `script.js`

## API Endpoints

### POST `/api/chat`
Sends a message to Flowise

**Request:**
```json
{
  "question": "Your question here",
  "sessionId": "session_uuid",
  "metadata": {}
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "text": "AI response here",
    "agent": "Router"
  }
}
```

### GET `/health`
Check backend status

**Response:**
```json
{
  "ok": true,
  "flowise_configured": true
}
```

## File Structure

```
AI_Study_App/
├── backend/
│   ├── app.py              # FastAPI server
│   ├── requirements.txt     # Python dependencies
│   ├── .env                # (Create this) Flowise config
│   └── .env.example        # Template
├── frontend/
│   ├── index.html          # Main UI
│   ├── script.js           # JavaScript logic
│   └── style.css           # Styling
└── .gitignore
```
