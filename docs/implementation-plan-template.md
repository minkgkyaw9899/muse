# Implementation plan: <feature>

## Outcome

State the smallest user-visible capability delivered by this slice.

## Required context read

- [ ] `docs/constitution.md`
- [ ] `docs/architecture.md`
- [ ] `docs/requirements.md`
- [ ] Relevant `CONTEXT.md` terms and ADRs
- [ ] Relevant Matt Pocock and Expo skills

## Scope

### Included

- <behavior>

### Excluded

- <explicit non-goal>

## Seams and tests

Name the public interface under test and confirm it before writing tests.

- Unit seam: <interface and behavior>
- Integration seam: <interfaces and adapters>
- Native/E2E seam, if applicable: <interface and behavior>

## Acceptance criteria

- [ ] <observable outcome>
- [ ] Accessibility behavior is defined.
- [ ] Failure and cancellation behavior is defined.
- [ ] Performance budget and measurement fixture are defined when the render/import path changes.

## Vertical slices

1. Failing behavior test → smallest passing implementation.
2. Next failing behavior test → smallest passing implementation.

## Validation

- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test:unit`
- [ ] `bun run test:integration`
- [ ] `bun run validate`
- [ ] Full diff self-review
- [ ] Documentation updated

## Rollback and risks

Describe data migration, native build, cache compatibility, licensing, and rollback concerns.
