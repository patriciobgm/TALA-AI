import math
import re
from dataclasses import dataclass

from .models import LearningResource, LearningResourceChunk
from .resource_index import index_learning_resource


TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


@dataclass
class RetrievedEvidence:
    chunk_id: int
    resource_id: int
    title: str
    resource_type: str
    locator: str
    excerpt: str
    score: float

    @property
    def citation(self):
        location = f" — {self.locator}" if self.locator else ""
        return f"{self.title}{location}"


def tokenize(value):
    return TOKEN_PATTERN.findall(value.casefold())


def _ensure_chunks(competency):
    resources = LearningResource.objects.filter(is_approved=True, competencies=competency).distinct()
    for resource in resources.filter(chunks__isnull=True):
        index_learning_resource(resource)
    return LearningResourceChunk.objects.filter(resource__in=resources).select_related("resource")


def retrieve_approved_evidence(competency, query: str, limit: int = 4):
    """Deterministic hybrid lexical retrieval over approved, competency-scoped chunks."""
    query_terms = tokenize(query) or tokenize(competency.title)
    chunks = list(_ensure_chunks(competency))
    document_frequency = {term: sum(term in set(chunk.keywords) for chunk in chunks) for term in set(query_terms)}
    ranked = []
    normalized_query = " ".join(query_terms)
    for chunk in chunks:
        content_terms = tokenize(f"{chunk.heading} {chunk.content}")
        term_counts = {term: content_terms.count(term) for term in set(query_terms)}
        score = sum((1 + math.log(count)) * math.log((len(chunks) + 1) / (document_frequency.get(term, 0) + 1) + 1) for term, count in term_counts.items() if count)
        if normalized_query and normalized_query in " ".join(content_terms):
            score += 2.0
        ranked.append((score, chunk.resource_id, chunk.position, chunk))
    selected = sorted(ranked, key=lambda item: (-item[0], item[1], item[2]))[:limit]
    return [RetrievedEvidence(chunk.id, chunk.resource_id, chunk.resource.title, chunk.resource.resource_type, chunk.locator, chunk.content[:1100], round(score, 4)) for score, _, _, chunk in selected]
