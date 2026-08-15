# Build stage
FROM golang:alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy dependency manifests
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Copy root-level migrations folder into the build context
# (The build context is set to the monorepo root via render.yaml or Render dashboard)
COPY migrations/ ./migrations/

# Build statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server/main.go

# Run stage
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server .

# Copy migrations so the server can run them on startup
COPY --from=builder /app/migrations ./migrations

# Expose API and metrics ports
EXPOSE 8080 9091

# Run the binary
CMD ["./server"]
