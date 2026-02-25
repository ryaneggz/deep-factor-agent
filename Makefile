.PHONY: install build dev test test-watch type-check check install-cli build-cli dev-cli test-cli type-check-cli install-all build-all test-all check-all loop loop-plan review archive help

help:            ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# Agent package targets
install:         ## pnpm install (agent)
	pnpm -C packages/deep-factor-agent install

build:           ## pnpm build (agent)
	pnpm -C packages/deep-factor-agent build

dev:             ## pnpm dev (agent, tsc --watch)
	pnpm -C packages/deep-factor-agent dev

test:            ## pnpm test (agent, vitest run)
	pnpm -C packages/deep-factor-agent test

test-watch:      ## pnpm test:watch (agent)
	pnpm -C packages/deep-factor-agent test:watch

type-check:      ## pnpm type-check (agent)
	pnpm -C packages/deep-factor-agent type-check

check:           ## Run type-check + test (agent)
	pnpm -C packages/deep-factor-agent type-check && pnpm -C packages/deep-factor-agent test

# CLI package targets
install-cli:     ## Install CLI deps
	pnpm -C packages/deep-factor-cli install

build-cli:       ## Build CLI (tsc + shebang)
	pnpm -C packages/deep-factor-cli build

dev-cli:         ## Dev CLI (tsc --watch)
	pnpm -C packages/deep-factor-cli dev

test-cli:        ## Test CLI (vitest run)
	pnpm -C packages/deep-factor-cli test

type-check-cli:  ## Type-check CLI (tsc --noEmit)
	pnpm -C packages/deep-factor-cli type-check

# Workspace-wide targets
install-all:     ## Install all packages
	pnpm install

build-all:       ## Build all packages
	pnpm -r build

test-all:        ## Test all packages
	pnpm -r test

check-all:       ## Type-check + test all packages
	pnpm -r type-check && pnpm -r test

# Ralph tooling
loop:            ## Run build loop (.ralph/loop.sh [N])
	.ralph/loop.sh $(N)

loop-plan:       ## Run plan loop (.ralph/loop.sh plan [N])
	.ralph/loop.sh plan $(N)

review:          ## Review logs (.ralph/review-log.sh [path])
	.ralph/review-log.sh $(ARGS)

archive:         ## Archive current phase (.ralph/archive.sh)
	.ralph/archive.sh $(NAME) $(if $(YES),--yes)
