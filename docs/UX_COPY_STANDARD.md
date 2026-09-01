# TALA-AI UX copy standard

TALA-AI is an operational learning-support system. User-facing language must describe classroom use, learner support, governance, privacy, and program evaluation. Do not frame routine features around a thesis defense or presentation.

## Message hierarchy

Use a persistent alert only when the user must notice or act on a current condition:

- Error: an action failed and the user needs a recovery step.
- Warning: a decision has risk, missing requirements, or irreversible impact.
- Success: a user action completed; dismiss automatically or provide a close control when practical.
- Information: a current status that materially changes what the user can do.

Do not use alerts for general page instructions, obvious workflow explanations, or repeated policy summaries. Put essential context in the page description, field helper text, empty state, or the control label closest to the action.

## Writing pattern

Prefer short, direct messages in this order:

1. Current state.
2. Required actor or next action, only when needed.
3. Consequence, only when it helps the user decide.

Examples:

- “Assessment submitted. Short essays are awaiting teacher review.”
- “Complete two required materials to unlock this diagnostic.”
- “This draft has learner records and cannot be deleted.”
- “No learning materials are assigned for this subject.”

## Terminology

- Use “Learning Record” or “Learning Support Record” for learner-facing and teacher-facing progress reports.
- Use “Program Evaluation” for authorized research, quality, and outcome monitoring.
- Use “assessment results,” “learning records,” or “recorded activity” when these are clearer than “evidence.”
- Reserve “evidence,” “grounding,” “provenance,” and model/provider details for research, audit, or authorized technical views where they have a precise operational meaning.
- Do not use “defense,” “defensive evidence,” or similar presentation-centered labels in the deployed product UI.

