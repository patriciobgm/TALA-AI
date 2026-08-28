import re

from django.db import transaction
from django.utils import timezone

from .models import Assessment, AuditEvent, Competency, ContentImport, LearningResource, Notification, Question, UserProfile
from .notifications import notify


class ContentImportError(ValueError):
    pass


def _extract_pdf(file_obj):
    from pypdf import PdfReader

    file_obj.seek(0)
    return "\n".join(page.extract_text() or "" for page in PdfReader(file_obj))


def _extract_docx(file_obj):
    from docx import Document

    file_obj.seek(0)
    document = Document(file_obj)
    paragraphs = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
    for table in document.tables:
        for row in table.rows:
            paragraphs.append(" | ".join(cell.text.strip() for cell in row.cells))
    return "\n".join(paragraphs)


def extract_document_text(content_import):
    filename = content_import.original_filename.casefold()
    if filename.endswith(".pdf"):
        text = _extract_pdf(content_import.source_file)
    elif filename.endswith(".docx"):
        text = _extract_docx(content_import.source_file)
    else:
        raise ContentImportError("Only text-based PDF and DOCX documents can be extracted.")
    text = text.replace("\x00", "").strip()
    if len(text) < 20:
        raise ContentImportError("No usable text was found. Scanned documents require OCR and cannot be imported in this release.")
    return text


QUESTION_START = re.compile(r"(?m)^\s*(\d+)[.)]\s+")
CHOICE_LINE = re.compile(r"^\s*([A-Fa-f])[.)]\s*(.+?)\s*$")
ANSWER_LINE = re.compile(r"^\s*(?:answer|correct answer|key)\s*:\s*(.+?)\s*$", re.IGNORECASE)
COMPETENCY_LINE = re.compile(r"^\s*competenc(?:y|ies)\s*:\s*(.+?)\s*$", re.IGNORECASE)


def parse_exam_text(text, default_competency=None):
    starts = list(QUESTION_START.finditer(text))
    questions = []
    for index, match in enumerate(starts):
        block = text[match.end(): starts[index + 1].start() if index + 1 < len(starts) else len(text)]
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        prompt_lines, options, answer, competency_code = [], [], "", ""
        for line in lines:
            choice_match = CHOICE_LINE.match(line)
            answer_match = ANSWER_LINE.match(line)
            competency_match = COMPETENCY_LINE.match(line)
            if choice_match:
                options.append({"label": choice_match.group(1).upper(), "text": choice_match.group(2)})
            elif answer_match:
                answer = answer_match.group(1).strip()
            elif competency_match:
                competency_code = competency_match.group(1).strip()
            elif not options and not answer:
                prompt_lines.append(line)
        prompt = " ".join(prompt_lines).strip()
        if not prompt or not answer:
            continue
        if len(answer) == 1 and options:
            selected = next((item["text"] for item in options if item["label"] == answer.upper()), None)
            answer = selected or answer
        competency = default_competency
        if competency_code:
            competency = Competency.objects.filter(subject=default_competency.subject if default_competency else None, code__iexact=competency_code).first()
        question_type = Question.QuestionType.MULTIPLE_CHOICE if len(options) > 2 else Question.QuestionType.TRUE_FALSE if len(options) == 2 and {item["text"].casefold() for item in options} == {"true", "false"} else Question.QuestionType.SHORT_ANSWER
        questions.append({
            "source_number": int(match.group(1)),
            "prompt": prompt,
            "question_type": question_type,
            "options": [item["text"] for item in options],
            "correct_answer": answer,
            "competency_id": competency.id if competency else None,
            "competency_code": competency.code if competency else competency_code,
            "confidence": "high" if competency and (options or question_type == Question.QuestionType.SHORT_ANSWER) else "needs_review",
        })
    return questions


def process_content_import(content_import):
    content_import.status = ContentImport.Status.PROCESSING
    content_import.error_message = ""
    content_import.save(update_fields=["status", "error_message", "updated_at"])
    try:
        if content_import.kind == ContentImport.Kind.VIDEO:
            payload = {"resource_type": LearningResource.ResourceType.VIDEO, "description": content_import.configuration.get("description", "")}
            text = ""
        else:
            text = extract_document_text(content_import)
            if content_import.kind == ContentImport.Kind.EXAM:
                questions = parse_exam_text(text, content_import.competency)
                if not questions:
                    raise ContentImportError("No complete questions were detected. Use numbered questions and include an 'Answer:' line for each item.")
                payload = {"questions": questions, "question_count": len(questions)}
            else:
                payload = {"resource_type": LearningResource.ResourceType.MODULE, "character_count": len(text)}
        content_import.extracted_text = text
        content_import.extracted_payload = payload
        content_import.status = ContentImport.Status.NEEDS_REVIEW
    except Exception as exc:
        content_import.status = ContentImport.Status.FAILED
        content_import.error_message = str(exc)[:2000]
    content_import.save(update_fields=["extracted_text", "extracted_payload", "status", "error_message", "updated_at"])
    return content_import


def _validate_exam_payload(content_import):
    questions = content_import.extracted_payload.get("questions", [])
    if not questions:
        raise ContentImportError("At least one extracted question is required.")
    validated = []
    for position, item in enumerate(questions, start=1):
        competency = Competency.objects.filter(pk=item.get("competency_id"), subject=content_import.subject).first()
        if not competency:
            raise ContentImportError(f"Question {position} must be mapped to a valid competency.")
        prompt = str(item.get("prompt", "")).strip()
        correct_answer = str(item.get("correct_answer", "")).strip()
        question_type = item.get("question_type")
        options = [str(option).strip() for option in item.get("options", []) if str(option).strip()]
        if not prompt or not correct_answer or question_type not in Question.QuestionType.values:
            raise ContentImportError(f"Question {position} is incomplete.")
        if question_type in {Question.QuestionType.MULTIPLE_CHOICE, Question.QuestionType.TRUE_FALSE} and correct_answer not in options:
            raise ContentImportError(f"Question {position}'s correct answer must match one of its choices.")
        validated.append((competency, prompt, question_type, options, correct_answer))
    return validated


@transaction.atomic
def publish_content_import(content_import, reviewer):
    if content_import.status != ContentImport.Status.NEEDS_REVIEW:
        raise ContentImportError("Only imports awaiting review can be published.")
    if content_import.kind == ContentImport.Kind.EXAM:
        questions = _validate_exam_payload(content_import)
        assessment = Assessment.objects.create(
            title=content_import.title,
            subject=content_import.subject,
            kind=content_import.configuration.get("assessment_kind", Assessment.Kind.PRE),
            instructions=content_import.configuration.get("instructions", ""),
            due_at=content_import.configuration.get("due_at") or None,
            is_active=False,
            created_by=reviewer,
        )
        class_ids = content_import.configuration.get("assigned_class_ids", [])
        assessment.assigned_classes.set(class_ids)
        for competency, prompt, question_type, options, answer in questions:
            Question.objects.create(assessment=assessment, competency=competency, prompt=prompt, question_type=question_type, options=options, correct_answer=answer)
        content_import.published_assessment = assessment
    else:
        resource_type = LearningResource.ResourceType.VIDEO if content_import.kind == ContentImport.Kind.VIDEO else LearningResource.ResourceType.MODULE
        resource = LearningResource.objects.create(
            title=content_import.title,
            resource_type=resource_type,
            difficulty=content_import.configuration.get("difficulty", "foundation"),
            content=content_import.configuration.get("description", "") if resource_type == LearningResource.ResourceType.VIDEO else content_import.extracted_text,
            file=content_import.source_file.name,
            original_filename=content_import.original_filename,
            mime_type=content_import.mime_type,
            is_approved=True,
            uploaded_by=reviewer,
        )
        if content_import.competency_id:
            resource.competencies.add(content_import.competency)
        content_import.published_resource = resource
        students = UserProfile.objects.filter(role=UserProfile.Role.STUDENT, user__recovery_plans__competency=content_import.competency, user__recovery_plans__status="active").select_related("user").distinct()
        for profile in students:
            notify(recipient=profile.user, kind=Notification.Kind.CONTENT_PUBLISHED, title="New learning material", message=f"{resource.title} is now available for your recovery plan.", action_url="/recovery", deduplication_key=f"resource:{resource.id}:student:{profile.user_id}")
    content_import.status = ContentImport.Status.PUBLISHED
    content_import.reviewed_by = reviewer
    content_import.reviewed_at = timezone.now()
    content_import.save(update_fields=["published_assessment", "published_resource", "status", "reviewed_by", "reviewed_at", "updated_at"])
    AuditEvent.objects.create(actor=reviewer, action="content_import.published", object_type="ContentImport", object_id=str(content_import.pk), metadata={"kind": content_import.kind, "title": content_import.title})
    return content_import
