# TALA-AI

TALA-AI is an academic-recovery platform aligned with the Philippine Department of Education's ARAL workflow. It gives students an ordered remediation path, gives teachers a consolidated view of learner progress and interventions, and keeps assessment scoring separate from optional AI-generated tutoring.

The current MVP includes:

- JWT authentication for student, teacher, and administrator roles
- diagnostic and mastery assessments with server-side scoring
- competency-level results and recovery-plan generation
- ordered learning activities backed by approved resources
- persisted activity completion and learner progress
- teacher learner profiles and intervention records
- administrator user and system views
- an optional, configurable local Llama tutor with resource citations

## Technology

- **Backend:** Python, Django, Django REST Framework, Simple JWT, SQLite
- **Frontend:** React, TypeScript, Vite, Material UI
- **Optional LLM:** `llama.cpp` through its OpenAI-compatible HTTP server

## Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- npm
- Optional: `llama.cpp` and an instruction-tuned GGUF model

The academic workflow does not depend on an LLM. If the model server is unavailable, Ask TALA reports that tutoring is unavailable while authentication, lessons, scoring, recovery plans, and teacher workflows remain operational.

## Quick start

### 1. Backend

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

The API and Django Admin will be available at:

- API: `http://127.0.0.1:8000/api/`
- Django Admin: `http://127.0.0.1:8000/admin/`

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

The frontend uses `http://127.0.0.1:8000/api` by default. To use another backend URL, copy `frontend/.env.example` to `frontend/.env` and update `VITE_API_URL`.

## Demo accounts

`python manage.py seed_demo` is idempotent and creates the curriculum, approved fraction resources, assessments, a sample diagnostic result, a recovery plan, and the following application accounts:

| Application role | Username | Password |
|---|---|---|
| Student | `student@tala.edu.ph` | `demo-password` |
| Teacher | `teacher@tala.edu.ph` | `demo-password` |
| Administrator | `admin@tala.edu.ph` | `demo-password` |

These credentials are for local development only. The application administrator can use TALA's administrator interface but is not a Django superuser.

### Django superuser

The local SQLite database is excluded from Git, so Django superusers are not transferred when the repository is cloned. Create one interactively when needed:

```bash
cd backend
source .venv/bin/activate
python manage.py createsuperuser --username superadmin --email superadmin@tala.local
```

If `superadmin` already exists locally but its password is unknown, reset it with:

```bash
python manage.py changepassword superadmin
```

## Local Llama setup

This step is optional. The recommended development model for an Apple M4 with 16 GB unified memory is Llama 3.1 8B Instruct using the `Q4_K_M` GGUF quantization.

Install `llama.cpp` on macOS:

```bash
brew install llama.cpp
```

Download and serve the model in one command:

```bash
llama-server \
  -hf bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M \
  --alias llama-local \
  --host 127.0.0.1 \
  --port 8080 \
  --ctx-size 4096 \
  --n-gpu-layers 99
```

The first run downloads the model; later runs use the local cache. Keep the model server running and verify it from another terminal:

```bash
curl http://127.0.0.1:8080/v1/health
curl http://127.0.0.1:8080/v1/models
```

Before starting Django, configure its provider in the same terminal session:

```bash
export LLM_PROVIDER=llama_cpp
export LLM_BASE_URL=http://127.0.0.1:8080/v1
export LLM_API_KEY=local-development
export LLM_MODEL=llama-local
export LLM_TIMEOUT_SECONDS=120
python manage.py runserver
```

Supported provider identifiers are `llama_cpp`, `ollama`, `openai_compatible`, and `openai`. They share a server-side provider contract, so changing providers does not require frontend changes. Never expose provider credentials through Vite variables or frontend code.

## End-to-end MVP test

### Student workflow

1. Sign in as `student@tala.edu.ph`.
2. Review the persisted diagnostic result on **My progress**.
3. Open **Recovery plan**.
4. Open the first available activity and review its approved learning content.
5. Select **Complete practice**. Activities unlock in order and completion persists after refresh.
6. If the local model is running, use **Ask TALA** from the recovery workspace and verify that its answer includes citations to approved resources.
7. Complete the remaining resource activities.
8. Open **Assessments** and take the Fractions mastery assessment.
9. Answer every question and submit it. The backend calculates the overall and competency scores.

### Teacher workflow

1. Sign out and sign in as `teacher@tala.edu.ph`.
2. Open **Learners** and select Maria Santos.
3. Review the learner's assessment history, competency results, recovery plan, and activity progress.
4. Record an intervention and verify that it remains visible after refreshing the learner profile.

### Administrator workflow

1. Sign out and sign in as `admin@tala.edu.ph`.
2. Review the administrator overview and user directory.
3. Verify that role and account status information matches the seeded accounts.
4. Use the separate `superadmin` account at `/admin/` only for Django data administration.

## Configuration

Backend settings are read from the process environment:

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `llama_cpp` | Provider adapter identifier |
| `LLM_BASE_URL` | `http://127.0.0.1:8080/v1` | OpenAI-compatible API base URL |
| `LLM_API_KEY` | `local-development` | Provider credential; unused by an unsecured local server |
| `LLM_MODEL` | `llama-local` | Model name or server alias |
| `LLM_TIMEOUT_SECONDS` | `60` | Tutor request timeout |
| `VITE_API_URL` | `http://127.0.0.1:8000/api` | Frontend API base URL |

`backend/.env.example` and `frontend/.env.example` contain the local defaults. Django currently reads exported environment variables directly; it does not automatically load `backend/.env`.

## API overview

Authentication:

```text
POST /api/auth/login/
POST /api/auth/refresh/
GET  /api/auth/me/
```

Core workflow:

```text
GET  /api/dashboard/admin/
GET  /api/dashboard/student/
GET  /api/dashboard/teacher/learners/
GET  /api/dashboard/teacher/learners/{student_id}/
GET  /api/assessments/
GET  /api/assessments/{id}/start/
POST /api/assessments/{id}/submit/
GET  /api/recovery-plans/
POST /api/recovery-plans/{plan_id}/activities/{activity_id}/complete/
POST /api/interventions/
GET  /api/tutor/health/
POST /api/tutor/plans/{plan_id}/messages/
```

Additional subjects, competencies, resources, assessments, users, recovery plans, and interventions endpoints are registered through Django REST Framework routers under `/api/`.

## Verification

Run backend checks and tests:

```bash
cd backend
source .venv/bin/activate
python manage.py check
python manage.py test
```

Run frontend linting and the production build:

```bash
cd frontend
npm install
npm run lint
npm run build
```

## Project structure

```text
TALA-AI/
├── backend/
│   ├── recovery/          Django domain models, APIs, services, retrieval, and LLM adapters
│   ├── tala/              Django project settings and root URLs
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── src/api/           API client and authentication helpers
│   ├── src/components/    Shared application-shell and interface components
│   ├── src/pages/         Role-specific workflows and pages
│   ├── src/theme.ts       Material UI theme and design tokens
│   └── package.json
└── README.md
```

## Architecture and safety boundaries

- Assessment scoring, competency classification, mastery, and progression are deterministic Django services.
- The LLM cannot change grades, mastery decisions, recovery status, or activity completion.
- Ask TALA retrieves only approved resources mapped to the recovery plan's active competency.
- Provider integration is isolated under `backend/recovery/llm/`.
- Retrieval is currently an application-owned deterministic implementation. A vector database can replace it without changing the tutor endpoint or provider interface.
- JWT access and refresh tokens are stored in browser session storage for this MVP.
- SQLite, demo credentials, `DEBUG=True`, and the development secret key are local-development defaults and must be replaced before production deployment.

## Current scope

This repository is an MVP vertical slice, not a production deployment. The main remaining production work includes hardened environment-based Django settings, a production database, secure secret management, deployment infrastructure, expanded administrative CRUD workflows, broader curriculum content, audit logging, and production-grade retrieval/evaluation for AI responses.
