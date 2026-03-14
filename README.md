# JskApp - LINE Official Account System

A LINE Official Account platform with LIFF integration, service requests, and real-time admin live chat for Community Justice Services.

## Tech Stack

> [!IMPORTANT]
> **WSL Development Environment Required**
> This project requires **WSL (Windows Subsystem for Linux)** for all development.
> - **Backend**: Must run in WSL using `backend/venv_linux`.
> - **Frontend**: Must run in WSL.
> - **System**: Windows OS is the host, but execution happens in WSL.

### Backend
- **FastAPI** (Python 3.13+)
- **PostgreSQL** (Database)
- **SQLAlchemy** (ORM with Async support)
- **Alembic** (Migrations)
- **Redis** (Caching & Rate Limiting)

### Frontend
- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**

## Project Structure

```
jsk-app/
├── backend/
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── core/         # Config & Security
│   │   ├── db/           # Database setup
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── services/     # Business logic
│   └── requirements.txt
├── frontend/
│   ├── app/              # Next.js App Router
│   ├── components/       # Reusable components
│   └── lib/              # Utilities
└── .agent/
    └── skills/           # Development standards
```

## Getting Started

### Prerequisites
- **Python 3.13+**
- Node.js 22+
- PostgreSQL 16+
- Redis 7+

### Backend Setup

1. Create virtual environment in WSL:
```bash
cd backend
python3.13 -m venv venv_linux
source venv_linux/bin/activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Copy and configure environment:
```bash
cp app/.env.example .env
# Or copy backend/.env.development.example / backend/.env.production.example
```

4. Run migrations:
```bash
alembic upgrade head
```

5. Start server:
```bash
uvicorn app.main:app --reload
```

To run with a specific backend env file:
```bash
ENV_FILE=.env.development uvicorn app.main:app --reload
ENV_FILE=.env.development alembic upgrade head
```

Backend will run at `http://localhost:8000`
API docs at `http://localhost:8000/api/v1/docs`

### Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Configure environment:
```bash
cp .env.local.example .env.local
```

For Cloudflare Tunnel local testing, you can use:
```bash
cp .env.development.example .env.local
```

3. Start dev server:
```bash
npm run dev
```

Frontend will run at `http://localhost:3000`

## Deployment Stack

Recommended deployment stack for this repository:

- **Frontend**: Vercel
- **Backend**: Koyeb
- **Database**: Supabase
- **Redis**: Upstash

Notes:

- This project uses WebSocket live chat, so backend deployment on Vercel is not recommended.
- Use the guides below for the exact environment variables and deployment flow.

## Features

- ✅ LINE Messaging API integration
- ✅ LIFF (LINE Frontend Framework) support
- ✅ Queue booking system
- ✅ Service request forms
- ✅ Real-time admin chat panel
- ✅ Role-based access control (RBAC)

## Development Standards

See `.agent/skills/` for comprehensive development guidelines:
- API Development
- Frontend Architecture
- Authentication & Security
- Database Design
- Testing
- Deployment

## Deployment Guides

- [Deploy on Vercel + Koyeb + Supabase + Upstash (Thai)](/docs/DEPLOY_VERCEL_KOYEB_SUPABASE_UPSTASH_TH.md)
- [Deployment Env Checklist: Vercel + Koyeb + Supabase + Upstash (Thai)](/docs/DEPLOY_ENV_CHECKLIST_VERCEL_KOYEB_SUPABASE_UPSTASH_TH.md)

## Environment Files

Backend example env:

- [backend/app/.env.example](/backend/app/.env.example)
- [backend/.env.development.example](/backend/.env.development.example)
- [backend/.env.production.example](/backend/.env.production.example)

Frontend example env:

- [frontend/.env.local.example](/frontend/.env.local.example)
- [frontend/.env.development.example](/frontend/.env.development.example)

## Local Tunnel Testing

Recommended Cloudflare Tunnel mapping for local testing:

- `app.example.com` -> `http://localhost:3000`
- `api.example.com` -> `http://localhost:8000`

Suggested local env values:

- Backend `SERVER_BASE_URL=https://api.example.com`
- Backend `BACKEND_CORS_ORIGINS=["https://app.example.com"]`
- Frontend `NEXT_PUBLIC_API_URL=https://api.example.com/api/v1`

## License

Private - All Rights Reserved
