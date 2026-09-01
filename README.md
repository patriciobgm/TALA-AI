# TALA-AI

TALA-AI is an academic-recovery platform aligned with the Philippine Department of Education's ARAL workflow. It turns diagnostic results into competency-based recovery plans, provides teacher-reviewed learning materials and scored practice, and notifies learners and teachers about progress and required work.

The LLM is an optional tutor. Assessment scoring, mastery, progression, deadlines, and notifications remain deterministic application services and continue to work when the model is offline.

## What is implemented

- JWT authentication and role-scoped student, teacher, and administrator workspaces
- normalized personal, student/employee, emergency-contact, and guardian profile records with controlled field ownership
- self-service profile photos/contact details, password recovery, password changes, and authenticator-app MFA
- Grade 11/12 and section-grouped student management, one-grade-per-subject curriculum, and superadministrator-controlled administrator access
- provider-neutral service diagnostics and administrative audit history
- URL-backed responsive web navigation with a persistent left sidebar
- diagnostic, mastery, and consent-gated remedial exams with server-side scoring
- competency results and ordered recovery-plan generation
- actual practice questions, answer feedback, passing thresholds, and persisted completion
- teacher exam/module/video submission with administrator review notifications and a focused governance workflow
- class-based module/video assignments with student notifications, a zoomable protected PDF reader, resumable video playback, extracted module quizzes, assignment-grounded Ask TALA support, and completion tracking
- protected, short-lived learning-material links instead of a public media folder
- in-app, email-ready, and Expo push-ready notifications and reminders
- teacher learner profiles, progress alerts, actionable AI recommendations, and auditable intervention records
- teacher-authored questions for draft assessments alongside document-extracted questions
- configurable local Llama/OpenAI-compatible tutor grounded in approved resources
- chunk-level approved-source retrieval with numbered citations and prompt-injection boundaries
- learner competency evidence used for tutor pacing, teacher-visible learning timelines, and on-demand AI instructional recommendations
- checksummed research-evidence snapshots covering competency improvement, recovery adherence, recommendation outcomes, TALA quality, usability, and consent history
- human TALA grounding/hallucination/answer-leakage review and anonymous task-based usability observations
- grade-derived teacher class access, separate user/security and class-management workspaces, and subject-specific competency pages
- structured tutor modes, bounded conversation memory, grounding status, latency, and response feedback records
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
llama-server --model "/Volumes/Mac Data/Models/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf" --alias llama-local --host 127.0.0.1 --port 8080 --ctx-size 4096 --n-gpu-layers 99
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
| TALA superadministrator | `superadmin@tala.edu.ph` | `demo-password` |

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

These accounts are for local testing only. The administrator manages learners, teachers, classes, curriculum, and operations but cannot view or manage administrator accounts. The superadministrator can sign in to the product UI and is the only role allowed to manage administrator access; it can also use Django Admin at `/admin/`. Change or remove every demo credential before deployment. Running `seed_demo` restores the documented development passwords.

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

## Grounded tutoring architecture

Ask TALA is more than an unrestricted chat completion. For every request, the backend:

1. verifies that the recovery plan belongs to the authenticated student;
2. resolves the current activity, practice question, and selected answer;
3. retrieves only approved content mapped to the plan's competency;
4. ranks bounded content chunks and assigns stable source numbers;
5. summarizes recent deterministic assessment and practice evidence for pacing;
6. includes only the six most recent conversation messages;
7. instructs the model to treat uploaded excerpts as untrusted reference text;
8. prevents the model from changing grades, completion, or mastery;
9. stores provider, model, latency, grounding status, and source citations; and
10. accepts helpful/not-helpful feedback for evaluation.

Available tutor modes are `explain`, `example`, `hint`, `check`, `simplify`, `reasoning`, and `practice`. Web and mobile expose the most common modes as concise actions.

The current retrieval ranker is deterministic and provider-neutral, which keeps SQLite development and offline testing simple. The next retrieval upgrade can add a configurable local embedding provider and PostgreSQL/pgvector without changing the tutor API or its safety boundary. Embedding quality must be evaluated against the existing grounding tests before it replaces or augments lexical ranking.

## Content import workflow

Sign in as a teacher and open **Content Imports** from the left navigation. Teachers submit source material and can correct extracted questions while the upload is awaiting review, but cannot publish it. Sign in as the product administrator to review the grouped governance queue, compare extracted questions with the original PDF, and publish approved material.

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
2. Assign the material to a competency, select one or more classes, and add a concise description.
3. Administrators receive an in-app review notification and inspect the submission in the focused review dialog.
4. The administrator confirms the class assignment and publishes it.
5. The review screen opens on the extracted quiz only. Use **Original Document** to compare it with the protected PDF preview; raw extracted page text is not presented as an editable form.
6. The uploader or administrator verifies the question, choices, answer, and competency before publication. The administrator retains approval authority.
7. Assigned students receive a notification and open the material from **Learning Materials** on web or mobile. The uploader is identified, PDF modules have zoom controls, and video position is saved automatically so students can continue across sessions and devices.
8. If an approved module quiz exists, it is presented separately from the document. The learner confirms readiness, then must pass it before the module is completed. Ask TALA can explain the current concept or provide a hint from approved module content, but is instructed not to reveal or confirm an answer. The system records each attempt and completion.

### Local Whisper video transcription

The backend now supports a configurable local `whisper.cpp` pipeline. It uses FFmpeg to extract 16 kHz mono WAV audio, runs `whisper-cli`, retains the transcript for review, and detects explicitly spoken, answer-keyed questions. It does not invent quiz questions when the transcript contains only lesson narration.

Install the Homebrew packages. The current development setup keeps the Whisper model on the external SSD:

```bash
brew install whisper-cpp ffmpeg
mkdir -p "/Volumes/Mac Data/Models"
curl --location --output "/Volumes/Mac Data/Models/ggml-base.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
command -v whisper-cli
command -v ffmpeg
```

Configure `backend/.env` using absolute paths:

```dotenv
WHISPER_ENABLED=true
WHISPER_CLI_PATH=/opt/homebrew/bin/whisper-cli
WHISPER_MODEL_PATH="/Volumes/Mac Data/Models/ggml-base.bin"
WHISPER_LANGUAGE=auto
WHISPER_TIMEOUT_SECONDS=1800
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
```

Restart Django and open **System Settings → Service Health**. The `transcription` service must report `configured`. Video processing is compute-intensive; the production deployment should run it through the configured Celery worker rather than a web request before enabling large-scale uploads.

## Teacher interventions and AI insights

An intervention is an auditable record of a teacher’s planned or completed follow-up—guided practice, supporting material, reassessment, monitoring, or parent contact. Recording it does not silently assign content, schedule an assessment, or change a grade. Those remain explicit workflows.

From a learner profile, **Generate Insight** summarizes recent assessment and practice evidence and proposes a concrete next action. **Create Intervention Record** copies that recommendation into a teacher-reviewed record. Teachers can edit the action and note before saving, so AI remains decision support rather than an autonomous academic decision-maker.

Approved recovery materials are also ranked by the versioned `evidence-rank-v1` algorithm. It uses the learner's recent competency evidence, practice history, the resource type and difficulty, and embedded checks for understanding. Teachers see the rationale and confidence, then explicitly add or dismiss the material. Accepted recommendations are inserted before the mastery check, recorded as an intervention, audited, and shown to the learner with a plain-language reason. See [the defensibility and completion audit](docs/DEFENSIBILITY_AUDIT.md) for the algorithm boundaries, evaluation requirements, and remaining deployment work.

To author an assessment without an uploaded document, open **Assessments** and choose **Add Assessment**. Enter its subject, type, assigned classes, due date, and instructions. Open the saved draft to add or edit questions. Active assessments must first be returned to draft to prevent the live question set from changing during learner attempts.

### Remedial exam and parent consent

Recovery lessons and mastery checks remain the normal learning workflow. A **Remedial exam** is a separate assessment type used after the learner completes the applicable recovery activities.

1. Create or import an exam and select **Remedial exam** as its assessment type.
2. Assign and activate it for the appropriate class.
3. Open the learner profile after required recovery activities are complete and select **Request parent consent**.
4. The system emails the recorded parent/legal guardian a signed response link using the expiry configured in **System Settings → Privacy & Consent**.
5. The guardian reviews the learner, exam, consent statement, policy version, and expiry, then approves or declines using the verified email link and electronic signature. If the school also uses a signed paper form, the guardian may attach a PDF/JPG/PNG copy from that page. Approval can be withdrawn with a recorded reason before the exam begins.
6. The remedial exam stays locked unless the current consent status is **Approved**. Consent transitions and teacher AI-insight generation are written to the audit log.

The default school policy version is deliberately `DRAFT-1`. Administrators must not mark it school-approved until the institution validates the exact wording, identity-verification process, escalation path, and retention rules.

### Research and defense evidence

Administrators can open **Research Evidence** to review live calculated outcomes, record anonymous student/teacher usability observations, human-review TALA responses, export the current evidence JSON, and freeze a named dataset version. A frozen snapshot stores its metrics, record counts, recommendation algorithm version, creator, timestamp, and SHA-256 checksum and cannot be silently edited.

Use [the research evaluation protocol](docs/RESEARCH_EVALUATION_PROTOCOL.md) before formal data collection. The interface creates traceable evidence; it does not replace research-adviser approval, school authorization, a privacy-impact assessment, or an appropriate statistical design.

Class assignments remain editable after publication from **Content Governance**. Removing every class keeps the approved resource in the governed library while removing it from student Learning Materials.

Module and exam files are limited to 25 MB; video files are limited to 500 MB. Files are checksummed and served through expiring signed links. Production deployments should add malware scanning and private object storage before accepting untrusted public uploads.

## End-to-end test guide

### Teacher: publish learning content

1. Sign in as `teacher@tala.edu.ph`.
2. Open **Content imports** and upload an exam or learning material.
3. Confirm extraction reaches **Needs review**; malformed or scan-only documents should show a recoverable error.
4. For a module or video, confirm the assigned classes, then review and publish the import.
5. For an exam, open **Assessments**, inspect the draft, and activate it.
6. Confirm the administrator review notification and, after publication, the assigned-student notifications are created.

### Student: complete the learning loop

1. Sign in as `student@tala.edu.ph`.
2. Open **My progress**, then **Recovery plan**.
3. Open **Learning Materials** and verify PDF zoom, resumable video, and any extracted module quiz.
4. Select the first unlocked recovery activity.
5. Read the lesson or open/play the attached teacher material.
6. Answer every practice question and select **Check answers**.
7. Verify an incorrect result shows feedback and does not complete the activity.
8. Reach the passing score and verify the next activity unlocks.
9. Optionally use **Ask TALA**; if Llama is offline, only tutoring should be unavailable.
10. Complete all required activities, open **Assessments**, and submit the mastery assessment.
11. Refresh any page, including `/imports`; the current URL and page should remain selected.

### Teacher: verify learner progress

1. Return as `teacher@tala.edu.ph`.
2. Open **Notifications** and confirm assessment/activity progress messages.
3. Open **Learners**, select Maria Santos, and review scores and plan progress.
4. Record an intervention and confirm it remains after refresh.

### Administrator

1. Sign in as `superadmin@tala.edu.ph` or `admin@tala.edu.ph`.
2. Open **Users & Security** to manage student, teacher, and administrator identities. Student placement is grade-first.
3. Open **Class Management** to manage Grade 11 or Grade 12 sections separately. Teacher class access is automatically derived from the grade levels of assigned subjects.
4. Manage a user to activate/deactivate access, send a password-reset link, or require a password change.
5. Open **Subjects**, then open a subject to manage its competencies on a separate page.
6. Open **Content Governance** to review uploads across all subjects.
7. Open **Research Evidence**, record study observations/quality reviews, export JSON, and freeze a versioned snapshot.
8. Open **System Settings**, run service checks, configure privacy/consent governance, update academic defaults, and review audit history.
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

Open `http://localhost:3000` unless `WEB_PORT` was changed. Port 3000 avoids conflicting with the default local llama.cpp service on port 8080. The stack includes PostgreSQL, Redis, Django/Gunicorn, Celery worker, Celery beat, and Nginx. Nginx serves the SPA, proxies `/api` and `/admin`, and serves protected media only after Django authorizes a signed request.

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
POST     /api/content-imports/{id}/assign/
POST     /api/content-imports/{id}/reject/

GET      /api/learning-assignments/
POST     /api/learning-assignments/{id}/open/
POST     /api/learning-assignments/{id}/progress/
POST     /api/learning-assignments/{id}/submit-quiz/
POST     /api/learning-assignments/{id}/complete/

GET/POST /api/assessments/
GET      /api/assessments/{id}/start/
POST     /api/assessments/{id}/submit/
POST     /api/assessments/{id}/request-consent/
GET/POST /api/remedial-consent/?token=...
GET      /api/recovery-plans/
POST     /api/recovery-plans/{plan}/activities/{activity}/complete/
POST     /api/tutor/learners/{student}/insight/

GET      /api/research/evidence/
GET/POST /api/research/snapshots/
GET/POST /api/research/usability-evaluations/
GET/POST /api/research/ai-evaluations/
GET/POST/PATCH /api/privacy/requests/

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
