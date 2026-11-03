# Architecture Migration Roadmap

## Goal

Evolve the app incrementally toward a feature-first, layered architecture. Keep Expo Router as the navigation entry point, preserve working behavior during migration, and avoid a high-risk rewrite.

The target is not a strict implementation of Clean Architecture everywhere. It is a practical combination:

- **Feature-first ownership** for product capabilities.
- **Layered boundaries** inside features where complexity warrants them.
- **Shared infrastructure** for cross-cutting concerns such as API transport, cache policy, SQLite, logging, and common UI.
- **React Query** for server state, local React state for screen-only interactions, and existing context/store providers only for genuinely app-wide state.

## Current baseline

- `src/app/` contains Expo Router routes and most screen-level behavior.
- `src/services/` contains API, offline storage, plan access, and other service modules.
- `src/context/` and `src/stores/` own authentication, app preferences, feedback, and plan access.
- `src/services/cache-policy.ts` centralizes query defaults, query keys, offline TTLs, and persistent cache identifiers.
- Encrypted SQLite offline snapshots are implemented separately from React Query's in-memory cache.
- Tests are required to remain flat in `src/__tests__/`, with no nested test folders.

## Target structure

```text
src/
  app/                         # Expo Router routes; thin composition/adapters
  features/
    wallet/
      screens/
      components/
      hooks/
      services/
      types.ts
      index.ts
    subscriptions/
    financial-history/
    notifications/
    plan-access/
  shared/
    api/                       # shared HTTP transport and API primitives
    cache/                     # policy, query keys, SQLite engine, cache adapters
    components/
    hooks/
    storage/
    utils/
  context/                     # app-wide providers
  stores/                      # app-wide client state
  constants/
  database/
  __tests__/                   # flat test directory
```

Do not create a layer or file solely to match this diagram. Small features may remain simple; use repositories/use-cases only when they clarify a real domain boundary.

## Migration principles

1. Move code in vertical feature slices, not by mechanically moving every file at once.
2. Keep route paths and externally observable behavior stable.
3. Before moving a module, identify its imports, query keys, cache invalidation, auth scope, and tests.
4. Preserve user-scoped keys and cache-clear behavior across sign-out, account switching, and rejected sessions.
5. Keep cache storage mechanisms distinct: React Query memory, encrypted SQLite snapshots, and SecureStore/AsyncStorage each have different security and lifetime needs.
6. Centralize cache policy and key ownership; leave feature-specific validation, fallback, and UI decisions with the owning feature.
7. Keep payment, wallet, and entitlement decisions authoritative on the server. Cached values are not proof for financial actions or current order state.
8. Keep tests in `src/__tests__/*.test.*`; use descriptive flat filenames to avoid collisions.
9. Each milestone must pass focused tests and TypeScript before proceeding.

## Milestones

### 0. Establish a migration baseline

- Record current route behavior, key API contracts, cache scopes, and error/loading/empty states for each feature.
- Ensure the full test suite is green and all tests are in the single flat test directory.
- Identify pre-existing lint failures separately so they are not accidentally attributed to architecture changes.

**Exit criteria:** baseline checks are reproducible; no known behavior or cache invalidation path is undocumented for the feature selected next.

### 1. Stabilize shared platform boundaries

- Keep `src/app/_layout.tsx` focused on router/provider composition.
- Consolidate cache policy, query keys, retry defaults, and cache invalidation helpers around `src/services/cache-policy.ts`; move/rename it to `src/shared/cache/` only when import churn is justified.
- Separate shared API transport/types from endpoint modules without changing endpoint behavior.
- Document which provider/store owns each app-wide state and prevent feature-only state from leaking into global stores.

**Exit criteria:** shared defaults and key factories are the source of truth; routes do not redefine shared infrastructure policies.

### 2. Migrate Wallet as the reference feature

- **Progress:** started. The Wallet screen implementation now lives in `src/features/wallet/`, the Expo Router file is a thin route adapter, and its test imports the feature public entry point.
- Create `src/features/wallet/` for the wallet screen logic, wallet-specific components, hooks, types, and service adapter.
- Keep the Expo route as a thin adapter that renders the feature screen.
- Move wallet query functions and SQLite fallback behind wallet-owned services while using the shared cache engine and policy.
- Keep idempotency persistence separate from display/offline caches.
- Preserve the rule that all financial writes and status reconciliation require live server responses.

**Exit criteria:** wallet behavior matches the baseline; offline cache, account switching, top-up, withdrawal, and IBAN tests pass.

### 3. Migrate subscription and plan access

- Separate catalog display, quote, purchase, and order-recovery responsibilities into subscriptions feature modules.
- Keep plan access as a distinct entitlement capability because its offline grace-period rules differ from ordinary display caches.
- Centralize query/cache key factories and stale/expiry values through the shared policy.
- Ensure cached pending orders never trigger automatic status checks and never authorize a new purchase.

**Exit criteria:** purchase idempotency, quote freshness, order recovery, entitlement expiry, and offline display behavior pass their tests.

### 4. Migrate financial history and notifications

- Move financial-history pagination, date filtering, and encrypted SQLite snapshot adapter into its feature.
- Move notification inbox/count queries and optimistic updates into notifications feature modules.
- Keep common list/pagination primitives shared only if at least two features use the same semantics.

**Exit criteria:** filters, pagination, cached pages, unread counts, optimistic mutations, and account scoping remain unchanged and tested.

### 5. Migrate remaining product capabilities incrementally

- Group related routes (profile/security, calculator tools, search, support) into feature folders as they are actively modified.
- Keep calculator data/database schemas and tool definitions in a clearly named data/domain boundary; do not couple them to account cache infrastructure.
- Extract reusable UI only after its API and use cases are clear across multiple features.

**Exit criteria:** new work for a migrated capability is implemented within its feature, and route files contain no duplicated domain/data behavior.

### 6. Enforce and document architecture boundaries

- Add lightweight import-boundary rules or lint checks after the folder boundaries have settled.
- Prevent feature modules from importing another feature's internals; expose intentional public APIs through each feature's `index.ts`.
- Update contributor documentation with ownership rules, testing conventions, cache policy updates, and migration examples.
- Review dependency direction and remove obsolete modules only after confirming no callers remain.

**Exit criteria:** boundary checks pass, the full suite and type-check pass, and the folder structure reflects actual ownership rather than empty placeholders.

## Definition of done for each feature slice

- Routes remain compatible and render through a thin Expo Router adapter.
- Loading, error, empty, offline, and success states are preserved.
- User-scoped query and persistent-cache data cannot bleed between accounts.
- Cache invalidation, expiry, logout, and account-switch behavior are covered.
- Tests are added/updated in the flat `src/__tests__/` directory.
- Focused tests, TypeScript, relevant lint, and `git diff --check` pass.
- No unrelated formatting or behavior changes are included.

## Suggested execution order

1. Finish central cache policy/key adoption and add direct tests for policy consumers.
2. Use Wallet as the first complete vertical migration.
3. Migrate subscriptions and plan access after Wallet proves the feature boundary.
4. Migrate financial history and notifications.
5. Move remaining features when touched by product work.
6. Add boundary enforcement last, based on proven ownership rules.

This order deliberately avoids a whole-app rewrite and prioritizes account flows where correctness, security, and offline behavior need the clearest ownership.
