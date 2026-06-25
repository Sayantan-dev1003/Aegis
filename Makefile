.PHONY: dev test migrate seed logs reset

dev:
	@echo "Starting Aegis services..."
	docker compose up --build -d

test:
	@echo "Running Go unit tests..."
	cd services/api && go test -v ./...
	@echo "Running Python unit tests..."
	@echo "Python tests placeholder (pytest services/ml-worker)"

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
