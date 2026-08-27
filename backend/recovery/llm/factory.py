from django.conf import settings
from .openai_compatible import OpenAICompatibleProvider

def get_llm_provider():
    supported = {"llama_cpp", "ollama", "openai_compatible", "openai"}
    if settings.LLM_PROVIDER not in supported:
        raise ValueError(f"Unsupported LLM provider: {settings.LLM_PROVIDER}")
    return OpenAICompatibleProvider(settings.LLM_PROVIDER, settings.LLM_BASE_URL, settings.LLM_API_KEY, settings.LLM_MODEL, settings.LLM_TIMEOUT_SECONDS)
