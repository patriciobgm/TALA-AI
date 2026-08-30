# TALA-AI research evaluation protocol

This document defines how to generate evidence that is reproducible and suitable for review. It is an implementation protocol, not ethics approval or authorization to process real learner data.

## Pre-registration checklist

Before collecting formal-study data, record and obtain approval for:

- research questions, hypotheses, outcomes, and statistical tests;
- participant inclusion/exclusion criteria and target sample size;
- informed consent/assent process and school privacy-impact assessment;
- the school-approved remedial-exam consent wording and authorized signatory;
- missing-data, withdrawal, outlier, and protocol-deviation handling;
- the fixed competency set, mastery thresholds, assessment questions, and scoring rules;
- the recommendation algorithm version (`evidence-rank-v1` for this release);
- the fixed TALA prompt/evaluation set and human-review rubric;
- the dataset version naming convention.

Do not tune rules, questions, prompts, or evaluation labels after viewing formal outcomes without recording a new study/version.

## Evidence captured by the product

Open **Administrator → Research Evidence**.

### Diagnostic-to-mastery improvement

The report pairs the earliest diagnostic and latest mastery evidence for the same learner and competency. It reports diagnostic average, mastery average, change, and paired-record count. Unpaired evidence is excluded rather than imputed.

### Recovery adherence

The report includes assigned/completed/overdue activity counts, completion rate, and completion time for fully completed plans. The current implementation measures duration from plan creation to its last completed activity.

### Recommendation outcome loop

Teacher acceptance/dismissal is stored with the rank score, rationale, and algorithm version. Recommended activities are distinguished from manual activities by stored recommendation metadata. The report compares completion and practice outcomes; this is observational evidence and must not be described as causal without an appropriate experimental design.

### TALA quality

Automated `grounding_status` shows whether retrieval/citation requirements were met. It is not an accuracy judgment. Under **TALA Quality Review**, a human reviewer records:

- whether the response is supported by cited approved sources;
- whether it contains a hallucinated claim;
- whether it leaks an answer the tutor should not reveal;
- reviewer notes.

For formal testing, randomize a fixed response sample, conceal condition/model labels where practical, use at least two trained reviewers, and report agreement plus adjudication rules.

### Usability

Use anonymous participant codes. Record role, task, completion outcome, time-on-task, observed errors, optional SUS score, and notes. Store signed study consent outside free-text observation fields according to the approved research process.

### Consent and eligibility

Consent status history is retained through requested, approved, declined, revoked, and expired states. The secure guardian email link has a configurable expiry, records verification/response metadata, requires a withdrawal reason, and stays separate from recovery completion eligibility.

## Freezing an evaluation dataset

1. Confirm formal data collection is complete and resolve documented data-quality issues.
2. Export the current JSON evidence package.
3. Select **Freeze Snapshot**.
4. Enter a unique study-facing dataset version such as `pilot-2026-v1`.
5. Record the generated SHA-256 checksum in the thesis appendix or evaluation log.
6. Preserve the matching database export and analysis scripts under access control.

A snapshot stores calculated metrics, record counts, algorithm version, evaluation period, creator, timestamp, and checksum. It is intentionally not editable. Corrections require a new dataset version and snapshot, with the reason documented.

## Minimum defense tables

- sample characteristics by role/grade/section using de-identified aggregates;
- diagnostic and mastery score per competency with paired sample count and change;
- recovery completion, overdue rate, and time-to-completion;
- recommendation reviewed/accepted/dismissed counts and outcome comparison;
- TALA review sample size, grounding accuracy, hallucination rate, leakage rate, and reviewer agreement;
- student and teacher task completion, errors, time-on-task, and SUS summary;
- consent requested/approved/declined/revoked/expired counts and remedial eligibility history;
- missing data, withdrawals, exceptions, and adverse events.

## Claim boundaries

The application can demonstrate traceable workflow outcomes and associations. It cannot by itself prove that TALA caused learning improvement. Causal claims require a research design that controls selection, prior ability, teacher effects, exposure, and other confounders. Small samples, demo data, or developer-reviewed TALA responses must be identified as such.

## Privacy and operational gates

Before using real student data:

- complete the school privacy-impact assessment for minors and educational records;
- approve the exact consent language and policy version in **System Settings → Privacy & Consent**;
- configure the privacy contact, retention schedule, correction/export/deletion handling, and exception escalation;
- remove demo accounts/data and rotate all credentials;
- deploy PostgreSQL, Redis/Celery, HTTPS, private durable storage, backups, monitoring, and malware scanning;
- test restore, incident response, accessibility, browser/mobile end-to-end flows, and realistic load.

Privacy requests are tracked through open, in-review, completed, or denied states. Deletion is not automatic because school record-retention obligations may apply; the authorized privacy administrator must document the decision and exception basis.
