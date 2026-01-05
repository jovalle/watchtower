.PHONY: help install dev build start lint lint-fix typecheck test test-watch test-coverage \
        check ci compose clean

# Default target
.DEFAULT_GOAL := help

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

## ci: Run CI pipeline locally (frozen lockfile + all checks)
ci:
	bun install --frozen-lockfile
	$(MAKE) check

## compose: Build and run with Docker Compose
compose:
	docker compose up --build

## clean: Clean build artifacts and caches
clean:
	rm -rf build .cache node_modules/.cache
