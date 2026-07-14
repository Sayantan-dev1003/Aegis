.PHONY: dev test test-go test-python mock migrate migrate-down seed logs reset

dev:
	@echo "Starting Aegis services..."
	docker compose up --build -d

## Run all tests (Go unit tests + Python unit tests)
test: test-go test-python

## Run only Go unit tests (no DB, no Kafka required)
test-go:
	@echo "Running Go unit tests..."
	cd services/api && go test -v -count=1 ./internal/service/... ./internal/validator/... ./internal/middleware/...

## Run only Python unit tests (no Kafka, no Redis required — all mocked)
test-python:
	@echo "Running Python unit tests..."
	cd services/ml-worker && .\venv\Scripts\python.exe -m pytest tests/ -v --tb=short

## Send mock transactions to the running API (requires: docker compose up)
mock:
	@echo "Sending mock transactions to API..."
	python scripts/mock_transactions.py --count 50 --rps 5 --fraud-ratio 0.2

migrate:
	@echo "Running database migrations..."
	go run services/api/cmd/migrate/main.go up

migrate-down:
	@echo "Reverting database migrations..."
	go run services/api/cmd/migrate/main.go down

seed:
	@echo "Seeding analyst accounts..."
	go run services/api/cmd/seed/main.go

logs:
	@echo "Tailing logs..."
	docker compose logs -f

reset:
	@echo "Tearing down and wiping volumes..."
	docker compose down -v
