# Makefile for tree-render
# Compatible with GNU Make 3.81 and GNU bash 3.2 (macOS defaults)

SHELL := /bin/bash

.PHONY: all dev build test clean install help

# Default target
all: build

# Install dependencies
install:
	pnpm install

# Run the development server
dev:
	pnpm dev

# Build for production
build:
	pnpm build

# Run tests (type checking via vue-tsc)
# Note: No test framework configured yet; this runs type checking
test:
	pnpm exec vue-tsc --noEmit

# Clean all generated files
clean:
	rm -rf dist
	rm -rf node_modules/.vite

# Deep clean (includes node_modules)
distclean: clean
	rm -rf node_modules

# Show available targets
help:
	@echo "Available targets:"
	@echo "  make install    - Install dependencies"
	@echo "  make dev        - Run the Vite development server"
	@echo "  make build      - Build for production"
	@echo "  make test       - Run type checking"
	@echo "  make clean      - Remove build artifacts"
	@echo "  make distclean  - Remove build artifacts and node_modules"
	@echo "  make help       - Show this help message"
