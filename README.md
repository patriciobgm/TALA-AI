# TALA-AI

TALA-AI is an academic-recovery platform aligned with the Philippine Department of Education's ARAL workflow. It turns diagnostic results into competency-based recovery plans, provides teacher-reviewed learning materials and scored practice, and notifies learners and teachers about progress and required work.

The LLM is an optional tutor. Assessment scoring, mastery, progression, deadlines, and notifications remain deterministic application services and continue to work when the model is offline.

## What is implemented

- JWT authentication and role-scoped student, teacher, and administrator workspaces
- normalized personal, student/employee, emergency-contact, and guardian profile records with controlled field ownership
- self-service profile photos/contact details, password recovery, password changes, and authenticator-app MFA
- administrator-managed students, teachers, administrators, classes, assignments, subjects, competencies, and academic defaults
- provider-neutral service diagnostics and administrative audit history
- URL-backed responsive web navigation with a persistent left sidebar
- diagnostic and mastery assessments with server-side scoring
- competency results and ordered recovery-plan generation
- actual practice questions, answer feedback, passing thresholds, and persisted completion
- teacher exam/module/video submission with separate administrator review and publication
- protected, short-lived learning-material links instead of a public media folder
- in-app, email-ready, and Expo push-ready notifications and reminders
- teacher learner profiles, progress alerts, and intervention records
- configurable local Llama/OpenAI-compatible tutor grounded in approved resources
- Expo/React Native student application
- PostgreSQL, Redis, Celery, Gunicorn, and Nginx Docker deployment baseline

## Technology

| Area | Stack |
|---|---|
| Backend | Python, Django, Django REST Framework, Simple JWT |
| Web | React, TypeScript, Vite, Material UI |
| Mobile | React Native, Expo, Expo Router, Secure Store |
| Production services | PostgreSQL, Redis, Celery, Gunicorn, Nginx |
| Optional LLM | `llama.cpp` or another OpenAI-compatible HTTP provider |

## Local quick start

Requirements: Python 3.11+, Node.js 20+, and npm.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

The API is at `http://127.0.0.1:8000/api/` and Django Admin is at `http://127.0.0.1:8000/admin/`.

When updating an existing checkout, run:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
```

### Web application

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. `VITE_API_URL` defaults to `http://127.0.0.1:8000/api`; override it in `frontend/.env` when required.

## Daily local runbook

After the one-time installation and migration steps, run each service in its own Terminal tab.

### Terminal 1 — local AI service

```bash
llama-server --model "$HOME/Models/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf" --alias llama-local --host 127.0.0.1 --port 8080 --ctx-size 4096 --n-gpu-layers 99
```

Confirm that it is ready:

```bash
curl http://127.0.0.1:8080/v1/models
```

### Terminal 2 — Django API

```bash
cd /Users/patriciobgm/Projects/TALA-AI/backend
source .venv/bin/activate
set -a
source .env
set +a
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Confirm local and phone access:

```bash
curl http://127.0.0.1:8000/api/health/
curl http://192.168.100.132:8000/api/health/
```

### Terminal 3 — web application

```bash
cd /Users/patriciobgm/Projects/TALA-AI/frontend
npm run dev
```

Open `http://localhost:5173`.

### Terminal 4 — mobile application, when needed

```bash
cd /Users/patriciobgm/Projects/TALA-AI/mobile
npx expo start --clear
```

The mobile `.env` should contain:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.100.132:8000/api
```

Use `npx expo start --dev-client` instead when testing an installed Expo development build and push notifications.

### Stop the services

For a service running in its Terminal tab, press `Control+C`. This is the preferred way to stop Llama, Django, Vite, and Expo.

If the Llama tab was closed but the process is still running, locate its process ID and stop that specific process:

```bash
pgrep -fl llama-server
kill PROCESS_ID
```

Verify that Llama has stopped:

```bash
curl http://127.0.0.1:8080/v1/models
```

The final command should report that it cannot connect.

### Docker alternative

When using the production-like Docker stack, do not start the backend and frontend commands above separately:

```bash
cd /Users/patriciobgm/Projects/TALA-AI
docker compose up --build -d
docker compose ps
```

Stop the Docker services without deleting database volumes:

```bash
docker compose stop
```

### Demo accounts

`python manage.py seed_demo` is idempotent and creates:

| Role | Username | Password |
|---|---|---|
| Student | `student@tala.edu.ph` | `demo-password` |
| Teacher | `teacher@tala.edu.ph` | `demo-password` |
| TALA administrator | `admin@tala.edu.ph` | `demo-password` |
| Django technical superuser | `superadmin@tala.edu.ph` | `demo-password` |

Additional teacher accounts use the same password: `ramon.mendoza@tala.edu.ph` and `liza.navarro@tala.edu.ph`.

Additional student accounts also use `demo-password`:

- `juan.delacruz@tala.edu.ph`
- `ana.reyes@tala.edu.ph`
- `paolo.garcia@tala.edu.ph`
- `sofia.mendoza@tala.edu.ph`
- `carlo.ramos@tala.edu.ph`
- `bea.navarro@tala.edu.ph`
- `miguel.torres@tala.edu.ph`
- `nina.flores@tala.edu.ph`
- `luis.villanueva@tala.edu.ph`

The seeded students intentionally have different diagnostic scores and recovery-plan completion levels so reports, intervention states, mastery locking, and progress views can be tested.

These accounts are for local testing only. Use `admin@tala.edu.ph` for the TALA product UI. The seeded technical superuser is deliberately restricted to Django Admin at `/admin/`; it is not a second product administrator role. Change or remove every demo credential before deployment. Running `seed_demo` restores the documented development passwords.

The academic dataset contains Grade 11 Rizal and Bonifacio, Grade 12 Mabini, and five Senior High School subjects: General Mathematics, English for Academic and Professional Purposes, Earth and Life Science, Oral Communication in Context, and Personal Development. Each subject has four competencies. Teachers have different class and subject assignments so role scoping can be verified.

## Local Llama on Apple Silicon

The recommended starting model for an Apple M4 with 16 GB unified memory is Llama 3.1 8B Instruct `Q4_K_M`.

```bash
brew install llama.cpp

llama-server \
  -hf bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M \
  --alias llama-local \
  --host 127.0.0.1 \
  --port 8080 \
  --ctx-size 4096 \
  --n-gpu-layers 99
```

Verify the service from another terminal:

```bash
llama-server --version
curl http://127.0.0.1:8080/v1/health
curl http://127.0.0.1:8080/v1/models
```

Configure Django in the terminal where it will run:

```bash
export LLM_PROVIDER=llama_cpp
export LLM_BASE_URL=http://127.0.0.1:8080/v1
export LLM_API_KEY=local-development
export LLM_MODEL=llama-local
export LLM_TIMEOUT_SECONDS=120
python manage.py runserver
```

Supported provider identifiers are `llama_cpp`, `ollama`, `openai_compatible`, and `openai`. Switching providers does not require a web or mobile change. Never put provider credentials in a `VITE_` or `EXPO_PUBLIC_` variable.

## Content import workflow

Sign in as a teacher and open **Content imports** from the left navigation. Teachers submit source material but cannot publish it. Sign in as the product administrator to review the shared governance queue, correct extracted questions, and publish approved material.

### Exam documents

1. Select **Exam**, a subject, competency, assessment type, and assigned class.
2. Upload a text-based PDF or DOCX, up to 25 MB.
3. Sign in as the administrator and review every extracted item; correct the draft if needed.
4. Approve and publish the import. This creates a draft assessment.
5. Open **Assessments** and activate it only after final review.

The deterministic MVP parser accepts numbered multiple-choice questions in this format:

```text
1. What is the least common denominator of 3 and 4?
A. 7
B. 8
C. 12
D. 24
Answer: C
Competency: GM-02
```

Publishing never automatically makes an assessment available to students. Administrator review and assessment activation are intentionally separate controls. Scanned images and handwriting require OCR and are reported as unsupported instead of silently inventing questions.

### Modules and videos

1. Select **Module** for PDF/DOCX or **Video** for MP4/WebM/MOV.
2. Assign the material to a competency and add a concise description.
3. An administrator reviews and publishes it.
4. The approved resource becomes available in matching recovery activities and can be opened or played by the student.

Module and exam files are limited to 25 MB; video files are limited to 500 MB. Files are checksummed and served through expiring signed links. Production deployments should add malware scanning and private object storage before accepting untrusted public uploads.

## End-to-end test guide

### Teacher: publish learning content

1. Sign in as `teacher@tala.edu.ph`.
2. Open **Content imports** and upload an exam or learning material.
3. Confirm extraction reaches **Needs review**; malformed or scan-only documents should show a recoverable error.
4. Review and publish the import.
5. For an exam, open **Assessments**, inspect the draft, and activate it.
6. Confirm a student notification is created.

### Student: complete the learning loop

1. Sign in as `student@tala.edu.ph`.
2. Open **My progress**, then **Recovery plan**.
3. Select the first unlocked activity.
4. Read the lesson or open/play the attached teacher material.
5. Answer every practice question and select **Check answers**.
6. Verify an incorrect result shows feedback and does not complete the activity.
7. Reach the passing score and verify the next activity unlocks.
8. Optionally use **Ask TALA**; if Llama is offline, only tutoring should be unavailable.
9. Complete all required activities, open **Assessments**, and submit the mastery assessment.
10. Refresh any page, including `/imports`; the current URL and page should remain selected.

### Teacher: verify learner progress

1. Return as `teacher@tala.edu.ph`.
2. Open **Notifications** and confirm assessment/activity progress messages.
3. Open **Learners**, select Maria Santos, and review scores and plan progress.
4. Record an intervention and confirm it remains after refresh.

### Administrator

1. Sign in as `superadmin@tala.edu.ph` or `admin@tala.edu.ph`.
2. Open **Users & classes**. Create or edit a class, assign students, and give teachers the appropriate classes and subjects.
3. Manage a user to activate/deactivate access, send a password-reset link, or require a password change.
4. Open **Curriculum**. Create/edit/archive subjects and competencies and verify mastery thresholds.
5. Open **Content governance** to review uploads across all subjects.
6. Open **System settings**, run service checks, update non-secret academic defaults, and review audit history.
7. Open **Account** in the lower sidebar to update the profile, change the password, or configure authenticator-app MFA.
8. Use `/admin/` only when framework-level recovery is required; normal administration should use the product UI.

Local password-reset email uses Django's console backend, so the single-use URL appears in the backend terminal. Configure SMTP and set `FRONTEND_URL` for deployed reset links. MFA setup displays a manual key compatible with standard TOTP authenticator apps and issues eight one-use recovery codes.

## Reminders and notification delivery

In-app notifications are persisted immediately. Local development runs Celery tasks eagerly by default. Generate due-activity reminders manually with:

```bash
cd backend
source .venv/bin/activate
python manage.py send_reminders
```

Production Docker starts Celery worker and beat services. Email requires a real Django email backend and SMTP configuration. Expo push requires an EAS project ID, a development/production app build, notification permission, and valid Expo push tokens.

## Mobile student application

The mobile application covers student login, password recovery, MFA verification, progress, recovery activities, video/module access, scored practice, assessments, an activity-aware Ask TALA conversation, notifications, and push registration.

The phone must reach Django over the local network. Replace the example address with the Mac's LAN IP:

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://YOUR_MAC_LAN_IP:8000/api
npm install
npx expo start
```

Run Django on the network interface during physical-device testing:

```bash
cd backend
source .venv/bin/activate
set -a
source .env
set +a
python manage.py runserver 0.0.0.0:8000
```

Set `DJANGO_ALLOWED_HOSTS` in `backend/.env` to include the Mac's LAN IP. The local `.env` files are ignored by Git.

Expo Go can test the application workflow, but remote push-token registration is intentionally skipped there. Configure an EAS project and use a development build for push testing:

```bash
cd mobile
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile development --platform ios
```

`eas init` writes the real project ID into Expo configuration. Do not commit a blank or invented project ID. Install the resulting development build on the iPhone, start Metro with `npx expo start --dev-client`, then grant notification permission when prompted.

## Docker deployment baseline

Copy the production example and replace every placeholder:

```bash
cp .env.production.example .env
docker compose up --build -d
docker compose exec backend python manage.py createsuperuser
docker compose ps
```

Open `http://localhost:8080` unless `WEB_PORT` was changed. The stack includes PostgreSQL, Redis, Django/Gunicorn, Celery worker, Celery beat, and Nginx. Nginx serves the SPA, proxies `/api` and `/admin`, and serves protected media only after Django authorizes a signed request.

Before an internet deployment, terminate TLS at a trusted reverse proxy/load balancer, use managed secrets and backups, configure SMTP, restrict hosts/origins, set operational monitoring, and use durable private object storage for uploaded files.

## Configuration

Local defaults are documented in `backend/.env.example`; production placeholders are in `.env.production.example`. Django reads process environment variables directly.

| Variable | Purpose |
|---|---|
| `DJANGO_DEBUG` | Must be `false` in production |
| `DJANGO_SECRET_KEY` | Long unique application secret |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated served hosts |
| `CSRF_TRUSTED_ORIGINS` | Comma-separated HTTPS origins |
| `DATABASE_URL` | SQLite locally; PostgreSQL in production |
| `CELERY_BROKER_URL` | Redis broker URL |
| `CELERY_TASK_ALWAYS_EAGER` | `true` locally, `false` with workers |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL` | Tutor provider selection |
| `LLM_API_KEY` | Server-only provider credential |
| `EMAIL_BACKEND`, `DEFAULT_FROM_EMAIL` | Notification email delivery |
| `VITE_API_URL` | Web API base URL at build time |
| `EXPO_PUBLIC_API_URL` | Non-secret mobile API base URL |

## API overview

```text
POST /api/auth/login/                     Obtain JWTs and role context
POST /api/auth/refresh/                   Rotate access/refresh tokens
GET  /api/auth/me/                        Current user
GET  /api/health/                         Database health

GET/POST /api/content-imports/            Upload and list imports
PATCH    /api/content-imports/{id}/        Review extracted content
POST     /api/content-imports/{id}/process/
POST     /api/content-imports/{id}/publish/
POST     /api/content-imports/{id}/reject/

GET/POST /api/assessments/
GET      /api/assessments/{id}/start/
POST     /api/assessments/{id}/submit/
GET      /api/recovery-plans/
POST     /api/recovery-plans/{plan}/activities/{activity}/complete/

GET      /api/notifications/
POST     /api/notifications/{id}/read/
POST     /api/notifications/read-all/
GET/PATCH /api/notification-preferences/
GET/POST /api/devices/

GET      /api/tutor/health/
POST     /api/tutor/plans/{plan}/messages/
```

All role-sensitive querysets and mutations are enforced by the backend; hiding a navigation item is not the security boundary.

## Verification

```bash
cd backend
source .venv/bin/activate
python manage.py check
python manage.py makemigrations --check
python manage.py test

cd ../frontend
npm run lint
npm run build

cd ../mobile
npx tsc --noEmit
npm run lint
npx expo export --platform web
```

## Project structure

```text
TALA-AI/
├── backend/      Django API, domain services, imports, tasks, and LLM adapters
├── frontend/     Material UI web application
├── mobile/       Expo/React Native student application
├── docker-compose.yml
└── README.md
```

## Safety and current production boundary

- Deterministic services—not the LLM—own grades, mastery, progression, and completion.
- Ask TALA can retrieve only approved resources mapped to the learner's active competency.
- Teachers submit uploaded exams and learning materials; administrator review, publication, and learner activation are separate controls.
- Uploaded media is not publicly mounted and signed access expires.
- Product administrators and Django technical superusers are distinct; the technical account cannot enter the product JWT workflow.
- JWT access/refresh tokens use short lifetimes and refresh rotation; mobile tokens use Secure Store.
- Audit events record material import, publication, and learner workflow actions.

This is a deployable single-site baseline, not a claim of institutional production certification. A school deployment still requires privacy-impact review, retention policy, backup/restore drills, malware scanning, OCR/handwriting validation if needed, observability, incident response, accessibility/user acceptance testing, and security review under the institution's policies and applicable Philippine data-protection requirements.
