.PHONY: help install dev build start lint lint-fix typecheck test test-watch test-coverage \
        docker-build docker-up docker-down docker-logs docker-clean clean

# Default target
.DEFAULT_GOAL := help

# Variables
DOCKER_IMAGE := ghcr.io/jovalle/watchtower
DOCKER_TAG := latest

## help: Show this help message
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'

## install: Install dependencies
install:
	bun install

## dev: Start development server
dev:
	bun run dev

## build: Build the application
build:
	bun run build

## start: Start production server
start:
	bun run start

## lint: Run ESLint
lint:
	bun run lint

## lint-fix: Run ESLint with auto-fix
lint-fix:
	bun run lint --fix

## typecheck: Run TypeScript type checking
typecheck:
	bun run typecheck

## test: Run tests
test:
	bun run test

## test-watch: Run tests in watch mode
test-watch:
	bun run test:watch

## test-coverage: Run tests with coverage
test-coverage:
	bun run test:coverage

## check: Run all checks (lint, typecheck, test)
check: lint typecheck test

## docker-build: Build Docker image
docker-build:
	docker compose build

## docker-dev: Build and tag dev image for testing
docker-dev:
	docker build -t $(DOCKER_IMAGE):dev .
	@echo ""
	@echo "Dev image built: $(DOCKER_IMAGE):dev"
	@echo "To push: docker push $(DOCKER_IMAGE):dev"
	@echo "To run locally: make docker-dev-up"

## docker-dev-up: Run dev image locally
docker-dev-up:
	DOCKER_TAG=dev docker compose up -d
	docker compose logs -f

## docker-dev-down: Stop dev container
docker-dev-down:
	docker compose down

## docker-up: Start application with Docker Compose
docker-up:
	docker compose up -d

## docker-down: Stop Docker Compose services
docker-down:
	docker compose down

## docker-logs: View Docker Compose logs
docker-logs:
	docker compose logs -f

## docker-restart: Restart Docker Compose services
docker-restart: docker-down docker-up

## docker-clean: Remove Docker image and volumes
docker-clean:
	docker compose down -v --rmi local

## clean: Clean build artifacts and caches
clean:
	rm -rf build .cache node_modules/.cache
