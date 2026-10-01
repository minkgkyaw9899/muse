# Muse engineering constitution

These rules are non-negotiable. A feature that violates one is incomplete even when it appears to work.

## Product principles

1. Reading remains private, offline, and free from advertisements or tracking.
2. Large and difficult PDFs are the benchmark, not an edge case.
3. The visible page and user input always outrank speculative work.
4. Accessibility and the non-glass fallback receive equal functional coverage.
5. Muse never bypasses DRM or claims support for formats it cannot legally and reliably read.

## Architecture principles

1. Native rendering complexity stays behind the `DocumentRenderer` seam.
2. Domain modules stay independent of frameworks and storage implementations.
3. Native resources have explicit ownership, bounded lifetimes, cancellation, and cleanup.
4. Work and memory are bounded independently of total page count.
5. Source publications and user metadata are durable; rendered cache is disposable.
6. Root native projects are generated. Reproducible native customization lives in local Expo modules and config plugins.
7. Hard-to-reverse decisions are recorded in concise ADRs before implementation depends on them.

## Development principles

1. Work in test-driven vertical slices: one failing behavior, the smallest complete implementation, then the next behavior.
2. Test public interfaces at agreed seams, not implementation details.
3. Each feature begins with a written implementation plan and ends with a reviewed diff and updated documentation.
4. Biome owns JS/TS/CSS formatting and linting. TypeScript strict mode remains enabled.
5. New packages require a stated need, SDK 57 compatibility evidence, and license review.
6. No feature is complete while lint, typecheck, Jest unit tests, Jest integration tests, React Native Testing Library UI tests, relevant Maestro flows, or the combined validation command fails.
7. Performance claims require repeatable measurements and named fixtures.
8. Every PR for work with an existing GitHub issue links that issue in the PR Development panel. Verify the link before declaring the PR ready; follow `docs/agents/issue-tracker.md` for the procedure.

## Security and legal principles

1. Treat imported publications as untrusted binary input.
2. Never log publication content, passwords, full local paths, or extracted search text.
3. Keep parser work cancellable and resource-limited; corrupt input must fail without taking down the app.
4. Do not distribute MuPDF until an accepted licensing decision and required notices/source obligations are documented.
5. Every third-party dependency must have a compatible license and pinned reproducible version or checksum where applicable.

## Change protocol

If a proposed change conflicts with this constitution, stop and surface the conflict. Amend the constitution only through an explicit, reviewed change that explains why the old rule no longer protects the product.
