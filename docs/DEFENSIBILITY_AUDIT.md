# TALA-AI defensibility and completion audit

## Product claim

TALA-AI supports one traceable academic-recovery cycle:

`diagnostic assessment → competency scoring → learning-gap classification → evidence-ranked recovery plan → grounded tutoring → practice → mastery assessment → teacher intervention → progress reporting`

Scoring, mastery, progression, consent gates, and assignment changes are deterministic application rules. The language model supports explanation and summarization; it does not set grades, declare mastery, or assign resources without a teacher decision.

## MVP coverage

| Capability | Current status | Defense evidence |
| --- | --- | --- |
| Authentication and role access | Implemented | JWT login, password reset, MFA, student/teacher/admin boundaries |
| Curriculum structure | Implemented | Grade-specific subjects, competencies, mastery thresholds, approved resources |
| Diagnostic and mastery assessment | Implemented | Server-side scoring and competency results |
| Learning-gap detection | Implemented | Deterministic `mastered`, `developing`, and `needs remediation` classification |
| Personalized recovery plan | Implemented and strengthened | Evidence-ranked approved resources with stored rationale and algorithm version |
| TALA learning companion | Implemented | Competency-scoped retrieval, approved-source citations, activity/question context, feedback capture |
| Teacher decision support | Implemented and strengthened | Evidence summary plus transparent material recommendations that teachers accept or dismiss |
| Human intervention | Implemented | Auditable intervention records; accepted recommendations become explicit plan activities |
| Reassessment and mastery | Implemented | Locked mastery checks, before/after evidence, plan completion |
| Content ingestion | Implemented baseline | PDF/DOCX extraction, video transcription, question review, approval and publication |
| Notifications and reminders | Implemented baseline | In-app events, Celery reminders, email/push-ready delivery records |
| Parent/guardian consent | Implemented and strengthened | Versioned policy state, expiring request, verified email link, approve/decline/withdraw/expire states, signature, withdrawal reason, and audit data |
| Research evidence package | Implemented baseline | Live metrics, anonymous usability observations, human TALA quality review, immutable versioned snapshots, and SHA-256 checksum |
| Web and student mobile access | Implemented baseline | Role-aware web application and Expo student application |

## Recommendation algorithm

The current recommendation system is explainable and reproducible (`evidence-rank-v1`). It:

1. considers only administrator-approved resources mapped to the learner's competency;
2. derives a support band from recent assessment/practice evidence and the competency threshold;
3. scores resource type and difficulty against that support band;
4. rewards embedded checks for understanding;
5. reduces repeated exposure to previously attempted resources;
6. excludes completed, already assigned, and teacher-dismissed resources;
7. stores the score, confidence, evidence signals, rationale, and algorithm version;
8. requires a teacher to accept or dismiss a recommendation;
9. records that decision in recommendation and audit histories.

The ranking score is a prioritization aid, not a probability or a grade. “High confidence” means that both learner performance evidence and embedded checks were available; it does not mean the material is guaranteed to improve performance.

## Remaining work before a formal defense

### 1. Research evaluation execution — required

- Use **Research Evidence** to freeze the mastery outcomes, `evidence-rank-v1` algorithm version, metrics, and record counts under a documented dataset version and SHA-256 checksum.
- The product now calculates paired competency baseline/endline, adherence, recommendation decisions/outcomes, consent states, and TALA quality rates; validate the operational definitions with the adviser before collection.
- Run teacher and student task-based usability testing and record completion, errors, time-on-task, and SUS results in the study workspace.
- Human-review a fixed TALA response sample for source support, answer leakage, and hallucination. Add pedagogical usefulness and unsafe/off-topic behavior to the external rubric if required by the protocol.
- Document sample size, inclusion criteria, missing data handling, and limitations with the research adviser.

See `docs/RESEARCH_EVALUATION_PROTOCOL.md` for the pre-registration, freezing, reporting, and claim-boundary procedure.

### 2. School policy and privacy review — required before real learner data

- Have the school validate the exact consent wording, authorized signatory, retention period, identity-verification method, exception process, and policy reference; then mark that version approved in **System Settings → Privacy & Consent**.
- Complete a privacy-impact assessment covering minors, educational records, AI conversations, guardian information, and uploaded documents.
- Use the privacy-request lifecycle for access/correction/export/deletion requests, while documenting legal/school-record exceptions rather than automatically deleting educational records.
- Replace demonstration guardian emails, users, passwords, and seeded academic data.

The current policy reference is aligned to DepEd DO 010, s. 2026 for the 2026 Summer Remediation Programs, while a DepEd parental-consent form is present in DM 035, s. 2025. The school must still approve the system's final consent text and operational procedure.

### 3. Production operations — required before deployment

- Deploy PostgreSQL, Redis, Celery worker/beat, HTTPS, SMTP, and durable object/media storage.
- Add encrypted backups and perform a documented restore drill.
- Add malware scanning and file quarantine for uploads.
- Add centralized error reporting, structured logs, uptime checks, and alert ownership.
- Establish incident response, administrator offboarding, credential rotation, and recovery procedures.

### 4. Quality assurance — required

- Add browser end-to-end tests for the complete student recovery cycle, teacher intervention, content approval, and consent flow.
- Add mobile device tests for keyboard behavior, interrupted video playback, offline/network errors, and push registration.
- Complete WCAG-focused keyboard, screen-reader, focus-order, contrast, zoom, and responsive testing.
- Test realistic volume: thousands of learners, resources, evidence events, and notifications.

### 5. Content and AI quality — next milestone

- Add OCR for scanned documents with explicit confidence and human review.
- Calibrate resource difficulty labels and recommendation weights with teachers.
- Add prerequisite relationships between competencies.
- Add recommendation outcome tracking so accepted materials can be compared with subsequent evidence.
- Create a versioned evaluation set for retrieval and TALA answers; do not rely only on anecdotal chat demonstrations.

## Recommended defense demonstration

1. Teacher creates and activates a competency-aligned diagnostic assessment.
2. Student submits it; show server-calculated per-competency results.
3. Open the automatically generated recovery plan and explain why each material was selected.
4. Ask TALA for a hint and show approved-source citations.
5. Submit practice and show the stored evidence event.
6. Teacher opens the learner, switches subject context, reviews the ranked recommendation, and either accepts or dismisses it.
7. Student completes the added activity and mastery assessment.
8. Show baseline-to-current change, intervention history, notification, and audit record.
9. Demonstrate that the same workflow still scores and progresses correctly when the LLM server is offline.

## Claim boundaries

Do not claim that TALA-AI diagnoses learning disabilities, predicts guaranteed academic improvement, autonomously teaches without oversight, or is already certified for institutional production. Defensible claims are that it provides competency-based recovery workflow support, evidence-ranked approved resources, grounded tutoring assistance, transparent teacher decision support, and auditable progress records.
