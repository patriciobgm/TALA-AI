import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from .base import LLMRequest, LLMResponse, LLMUnavailable

class OpenAICompatibleProvider:
    def __init__(self, name: str, base_url: str, api_key: str, model: str, timeout: int = 60):
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def _request(self, path: str, payload: dict | None = None):
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"}
        request = Request(f"{self.base_url}{path}", data=json.dumps(payload).encode() if payload else None, headers=headers, method="POST" if payload else "GET")
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            raise LLMUnavailable(f"The configured {self.name} service is unavailable.") from exc

    def generate(self, request: LLMRequest) -> LLMResponse:
        payload = {"model": self.model, "messages": [{"role": "system", "content": request.system}, *request.messages], "temperature": request.temperature, "max_tokens": request.max_tokens, "stream": False}
        data = self._request("/chat/completions", payload)
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMUnavailable("The local model returned an unsupported response.") from exc
        return LLMResponse(text=text, provider=self.name, model=self.model, usage=data.get("usage", {}))

    def health_check(self) -> bool:
        try:
            self._request("/models")
            return True
        except LLMUnavailable:
            return False
