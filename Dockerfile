# ── Stage 1: Build the React frontend ──────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy package files and install deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy frontend source and build
COPY nlpui/ ./nlpui/
COPY vite.config.js ./

RUN npm run build

# ── Stage 2: Python backend + built frontend ────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# System deps for pdfminer and owlready2
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Python deps
RUN pip install --no-cache-dir \
    flask \
    flask-cors \
    rdflib \
    owlready2 \
    pdfminer.six \
    python-docx

# Optional: spaCy for pre-annotation (downloads model at build time)
RUN pip install --no-cache-dir spacy && \
    python -m spacy download en_core_web_sm || true

# Copy backend
COPY app.py ./
COPY bfo-core.ttl ./
COPY CommonCoreOntologiesMerged.ttl ./

# Copy built frontend from stage 1
COPY --from=frontend-build /app/static ./static

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 5056

CMD ["python3", "app.py"]
