import re
from .models import LearningResource

def retrieve_approved_resources(competency, query: str, limit: int = 3):
    """Provider-neutral MVP retrieval. Can be replaced by a vector backend without changing tutor orchestration."""
    terms = set(re.findall(r"[a-z0-9]+", query.casefold()))
    resources = LearningResource.objects.filter(is_approved=True, competencies=competency).distinct()
    ranked = []
    for resource in resources:
        haystack = set(re.findall(r"[a-z0-9]+", f"{resource.title} {resource.content}".casefold()))
        ranked.append((len(terms & haystack), resource.id, resource))
    return [item[2] for item in sorted(ranked, key=lambda item: (-item[0], item[1]))[:limit]]
