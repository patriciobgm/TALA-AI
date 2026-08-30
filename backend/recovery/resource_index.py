import re

from .models import LearningResourceChunk


TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


def terms(value):
    return TOKEN_PATTERN.findall(value.casefold())


def split_content(content, max_chars=1100):
    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", content or "") if item.strip()]
    if not paragraphs and content.strip():
        paragraphs = [content.strip()]
    chunks, current = [], ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 2 <= max_chars:
            current = f"{current}\n\n{paragraph}".strip()
            continue
        if current:
            chunks.append(current)
        while len(paragraph) > max_chars:
            boundary = paragraph.rfind(" ", 0, max_chars)
            boundary = boundary if boundary > max_chars // 2 else max_chars
            chunks.append(paragraph[:boundary].strip())
            paragraph = paragraph[boundary:].strip()
        current = paragraph
    if current:
        chunks.append(current)
    return chunks


def index_learning_resource(resource):
    locator = resource.original_filename or ("External resource" if resource.external_url else "Approved TALA lesson")
    payload = split_content(resource.content)
    resource.chunks.all().delete()
    return LearningResourceChunk.objects.bulk_create([
        LearningResourceChunk(
            resource=resource,
            position=index,
            heading=resource.title,
            content=content,
            locator=locator,
            keywords=sorted(set(terms(f"{resource.title} {content}")))[:80],
        )
        for index, content in enumerate(payload, start=1)
    ])
