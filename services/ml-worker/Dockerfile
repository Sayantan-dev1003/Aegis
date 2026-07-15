# =============================================================================
# Aegis ML Worker - Production Dockerfile
# =============================================================================

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# -----------------------------------------------------------------------------
# System dependencies required for scientific Python packages
# -----------------------------------------------------------------------------

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip

RUN pip install --prefix=/install -r requirements.txt

# =============================================================================
# Runtime Image
# =============================================================================

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONFAULTHANDLER=1

WORKDIR /app

# -----------------------------------------------------------------------------
# Runtime libraries
# -----------------------------------------------------------------------------

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Create non-root user
# -----------------------------------------------------------------------------

RUN groupadd -r aegis && \
    useradd -r -g aegis aegis

# -----------------------------------------------------------------------------
# Install Python packages from builder
# -----------------------------------------------------------------------------

COPY --from=builder /install /usr/local

# -----------------------------------------------------------------------------
# Copy application
# -----------------------------------------------------------------------------

COPY --chown=aegis:aegis app ./app

COPY --chown=aegis:aegis deployment ./deployment

COPY --chown=aegis:aegis artifacts ./artifacts

USER aegis

# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------

EXPOSE 9091

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=30s \
    --retries=3 \
CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9091/ready')"

# -----------------------------------------------------------------------------
# Start
# -----------------------------------------------------------------------------

CMD ["python", "-m", "app.main"]