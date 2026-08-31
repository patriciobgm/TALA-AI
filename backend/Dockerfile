FROM debian:bookworm-slim AS whisper-builder

ARG WHISPER_CPP_VERSION=v1.9.2
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates cmake git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${WHISPER_CPP_VERSION} https://github.com/ggerganov/whisper.cpp.git /src/whisper.cpp \
    && cmake -S /src/whisper.cpp -B /src/whisper.cpp/build -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_CPU_ARM_ARCH=armv8-a -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON \
    && cmake --build /src/whisper.cpp/build --config Release --target whisper-cli -j2

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=whisper-builder /src/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home --uid 10001 tala && mkdir -p /app/media /app/staticfiles && chown -R tala:tala /app
USER tala

EXPOSE 8000
CMD ["gunicorn", "tala.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120"]
