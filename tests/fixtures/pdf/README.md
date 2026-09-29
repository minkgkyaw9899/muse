# PDF fixtures

Tiny, hand-built inputs for the native inspection tests (`bun run test:native`).

| File | Purpose |
| --- | --- |
| `valid-2-pages.pdf` | Two pages, no cross-reference table (MuPDF repairs it). SHA-256 `fe29a275…cb8fa`. |
| `encrypted.pdf` | The valid PDF encrypted with AES-256 by `mutool clean -E aes-256 -O owner-secret -U user-secret`. The passwords are test values, not secrets. |
| `corrupt-header-only.pdf` | Starts with `%PDF-` but has no usable structure. |
| `not-a-pdf.txt` | Plain text. |

Large and 100,000-page inputs are generated at test time, never committed.
