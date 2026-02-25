.PHONY: install build dev test test-watch type-check check loop loop-plan review archive help

help:            ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install:         ## pnpm install
	pnpm -C packages/deep-factor-agent install

build:           ## pnpm build (tsc)
	pnpm -C packages/deep-factor-agent build

dev:             ## pnpm dev (tsc --watch)
	pnpm -C packages/deep-factor-agent dev

test:            ## pnpm test (vitest run)
	pnpm -C packages/deep-factor-agent test

test-watch:      ## pnpm test:watch (vitest)
	pnpm -C packages/deep-factor-agent test:watch

type-check:      ## pnpm type-check (tsc --noEmit)
	pnpm -C packages/deep-factor-agent type-check

check:           ## Run type-check + test
	pnpm -C packages/deep-factor-agent type-check && pnpm -C packages/deep-factor-agent test

loop:            ## Run build loop (.ralph/loop.sh [N])
	.ralph/loop.sh $(N)

loop-plan:       ## Run plan loop (.ralph/loop.sh plan [N])
	.ralph/loop.sh plan $(N)

review:          ## Review logs (.ralph/review-log.sh [path])
	.ralph/review-log.sh $(ARGS)

archive:         ## Archive current phase (.ralph/archive.sh)
	.ralph/archive.sh $(NAME) $(if $(YES),--yes)
