import json
import re
from pathlib import Path

from .content_imports import ContentImportError, _balanced_source_excerpt, _decode_ai_json, _extract_docx, _extract_pdf, _resolve_quiz_answer, parse_exam_text
from .llm.base import LLMRequest, LLMUnavailable
from .llm.factory import get_llm_provider
from .models import AssessmentQuestionImport, Competency, Question


ANSWER_KEY_HEADING = re.compile(r"(?im)^\s*answer\s*key\s*:?[ \t]*$")
INLINE_KEY_ITEM = re.compile(r"(?i)(?:^|\s)(\d{1,3})\s*[.)\-:|]\s*(A|B|C|D|E|F|TRUE|FALSE)(?=\s|$)")
LINE_KEY_ITEM = re.compile(r"(?i)^\s*(\d{1,3})\s*[.)\-:|]\s*(.+?)\s*$")
QUESTION_NUMBER = re.compile(r"(?m)^\s*(\d{1,3})[.)]\s+")


def _extract_upload(file_field, filename, minimum_characters=20):
    suffix = Path(filename).suffix.casefold()
    with file_field.open("rb") as handle:
        if suffix == ".pdf":
            text = _extract_pdf(handle)
        elif suffix == ".docx":
            text = _extract_docx(handle)
        else:
            raise ContentImportError("Only text-based PDF and DOCX files are supported.")
    text = text.replace("\x00", "").strip()
    if len(text) < minimum_characters:
        raise ContentImportError("No usable text was found. Scanned documents require OCR and are not supported yet.")
    return text


def _answer_key(text):
    answers = {}
    for line in text.splitlines():
        match = LINE_KEY_ITEM.match(line)
        if match:
            answers[int(match.group(1))] = match.group(2).strip()
    for match in INLINE_KEY_ITEM.finditer(text):
        answers[int(match.group(1))] = match.group(2).strip()
    return answers


def _questionnaire_parts(questionnaire_text, separate_key_text=""):
    if separate_key_text:
        return questionnaire_text, _answer_key(separate_key_text), separate_key_text
    heading = ANSWER_KEY_HEADING.search(questionnaire_text)
    if not heading:
        return questionnaire_text, {}, ""
    question_text = questionnaire_text[:heading.start()].strip()
    key_text = questionnaire_text[heading.end():].strip()
    return question_text, _answer_key(key_text), key_text


def _normalize_ai_questions(rows, competencies, default_competency):
    by_code = {item.code.casefold(): item for item in competencies}
    normalized = []
    for position, row in enumerate(rows if isinstance(rows, list) else [], start=1):
        if not isinstance(row, dict):
            continue
        prompt = str(row.get("prompt", row.get("question", ""))).strip()
        raw_type = str(row.get("question_type", "mcq")).strip().casefold().replace("-", "_")
        question_type = {"multiple_choice": "mcq", "true_false": "tf", "identification": "short", "short_answer": "short", "short_essay": "essay"}.get(raw_type, raw_type)
        if question_type not in Question.QuestionType.values:
            question_type = Question.QuestionType.MULTIPLE_CHOICE
        options = [str(value).strip() for value in row.get("options", []) if str(value).strip()] if isinstance(row.get("options", []), list) else []
        if question_type == Question.QuestionType.TRUE_FALSE:
            options = ["True", "False"]
        if question_type in {Question.QuestionType.SHORT_ANSWER, Question.QuestionType.ESSAY}:
            options = []
        raw_answer = row.get("correct_answer", row.get("answer", ""))
        answer = _resolve_quiz_answer(raw_answer, options) if options else str(raw_answer).strip()
        competency = by_code.get(str(row.get("competency_code", "")).strip().casefold()) or default_competency
        if not prompt or not answer or not competency:
            continue
        if options and (len(options) < 2 or answer not in options):
            continue
        try:
            source_number = int(row.get("source_number", position))
            character_limit = int(row.get("character_limit", 500 if question_type == Question.QuestionType.ESSAY else 240))
        except (TypeError, ValueError):
            continue
        normalized.append({
            "source_number": source_number,
            "prompt": prompt,
            "question_type": question_type,
            "options": options,
            "correct_answer": answer,
            "character_limit": max(100, min(2000, character_limit)) if question_type == Question.QuestionType.ESSAY else 240,
            "competency_id": competency.id,
            "competency_code": competency.code,
            "confidence": "needs_review",
            "provenance": "ai",
            "source_locator": str(row.get("source_locator", f"Question {source_number}"))[:240],
        })
    return normalized


def _ai_extract(question_text, key_text, competencies, default_competency):
    competency_context = "\n".join(f"- {item.code}: {item.title}" for item in competencies)
    response = get_llm_provider().generate(LLMRequest(
        system=("You extract assessment questions from teacher-provided documents. Copy only supplied questions and answers, "
                "never invent facts or new questions, and return valid JSON only."),
        messages=[{"role": "user", "content": f'''Extract every complete question that fits in the supplied excerpt. Match answers against the answer key. Map each item to the closest allowed competency, using the default when uncertain.

ALLOWED COMPETENCIES:
{competency_context}
DEFAULT: {default_competency.code}: {default_competency.title}

Return only {{"questions":[{{"source_number":1,"prompt":"...","question_type":"mcq|tf|short|essay","options":["..."],"correct_answer":"...","character_limit":500,"competency_code":"...","source_locator":"Question 1"}}]}}.

QUESTIONNAIRE:
{_balanced_source_excerpt(question_text, 5000)}

ANSWER KEY:
{_balanced_source_excerpt(key_text, 1600) if key_text else "Answers may appear beside each question."}'''}],
        temperature=0.0,
        max_tokens=2400,
    ))
    payload = _decode_ai_json(response.text)
    rows = payload.get("questions", []) if isinstance(payload, dict) else payload
    questions = _normalize_ai_questions(rows, competencies, default_competency)
    if not questions:
        raise ContentImportError("TALA could not identify complete, answer-keyed questions in this document.")
    return questions, response


def analyze_assessment_question_import(import_record):
    questionnaire_text = _extract_upload(import_record.source_file, import_record.original_filename)
    separate_key_text = _extract_upload(import_record.answer_key_file, import_record.answer_key_original_filename, minimum_characters=1) if import_record.answer_key_file else ""
    question_text, answers, key_text = _questionnaire_parts(questionnaire_text, separate_key_text)
    default_id = import_record.configuration.get("default_competency_id")
    default_competency = Competency.objects.filter(pk=default_id, subject=import_record.assessment.subject, is_active=True).first()
    if not default_competency:
        raise ContentImportError("Choose an active default competency from the assessment subject.")
    competencies = list(Competency.objects.filter(subject=import_record.assessment.subject, is_active=True).order_by("code"))
    extracted = parse_exam_text(question_text, default_competency, answers or None)
    for item in extracted:
        item.update({"provenance": "extracted", "source_locator": f"Question {item['source_number']}"})
    expected = len(QUESTION_NUMBER.findall(question_text))
    provider = model = ""
    method = "deterministic"
    warning = ""
    if not extracted or (expected and len(extracted) < expected):
        try:
            ai_questions, response = _ai_extract(question_text, key_text or separate_key_text, competencies, default_competency)
            merged = {item["source_number"]: item for item in ai_questions}
            merged.update({item["source_number"]: item for item in extracted})
            extracted = [merged[key] for key in sorted(merged)]
            provider, model, method = response.provider, response.model, "hybrid"
        except (LLMUnavailable, ContentImportError, ValueError) as exc:
            if not extracted:
                raise ContentImportError(str(exc)) from exc
            warning = f"AI normalization was unavailable; {len(extracted)} deterministically extracted questions remain reviewable."
    if not extracted:
        raise ContentImportError("No complete questions were detected. Include numbered questions and an answer key.")
    if len(extracted) > 100:
        raise ContentImportError("A questionnaire import is limited to 100 questions.")
    return extracted, {
        "method": method,
        "provider": provider,
        "model": model,
        "source_character_count": len(questionnaire_text),
        "answer_key_character_count": len(separate_key_text or key_text),
        "detected_question_count": expected,
        "proposed_question_count": len(extracted),
        "warning": warning,
    }


def process_assessment_question_import(import_id):
    record = AssessmentQuestionImport.objects.select_related("assessment__subject").get(pk=import_id)
    try:
        questions, metadata = analyze_assessment_question_import(record)
        record.proposed_questions = questions
        record.analysis_metadata = metadata
        record.status = AssessmentQuestionImport.Status.READY
        record.error_message = ""
    except Exception as exc:
        record.status = AssessmentQuestionImport.Status.FAILED
        record.error_message = str(exc)[:2000]
    record.save(update_fields=["proposed_questions", "analysis_metadata", "status", "error_message", "updated_at"])
    return record
