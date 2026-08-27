from dataclasses import dataclass, field
from typing import Protocol

@dataclass
class LLMRequest:
    system: str
    messages: list[dict[str, str]]
    temperature: float = 0.2
    max_tokens: int = 500

@dataclass
class LLMResponse:
    text: str
    provider: str
    model: str
    usage: dict = field(default_factory=dict)

class LLMProvider(Protocol):
    name: str
    def generate(self, request: LLMRequest) -> LLMResponse: ...
    def health_check(self) -> bool: ...

class LLMUnavailable(Exception):
    pass
