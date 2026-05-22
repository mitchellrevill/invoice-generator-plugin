# Invoice Generator Plugin

Generate professional invoices as PDF and HTML for Jon Revill Flooring.

## What this plugin provides

- **Skill** `/invoice-generator:create` — create invoices from natural language or handwritten notes
- **Agent** `invoice-specialist` — handles batch jobs, handwritten note interpretation, and VAT calculations
- **Scripts** — `scripts/generate-pdf.mjs` and `scripts/generate-html.mjs`

## Hardcoded defaults (always applied)

- **Bill From:** Jon Revill Flooring, 11 Spotswood Place, Gleadless Valley, Sheffield, S14 1LE
- **Payment:** Virgin Money — Account 21200470, Sort Code 05-08-38
- **VAT Reg:** 684341620

## Usage

### Quick invoice
```
/invoice-generator:create invoice Burngreave for carpet fitting at 10 Clara Place, £470 plus VAT
```

### From handwritten notes
Upload a photo and say:
```
/invoice-generator:create turn these handwritten notes into invoices
```

### Batch
```
/invoice-generator:create generate invoices for all jobs on this sheet
```

## Prerequisites

- Node.js 18+
- Dependencies pre-installed in `scripts/node_modules/`

## Output

Files are written to whichever path you specify:
- `invoice-NNNN.pdf`
- `invoice-NNNN.html` (prints cleanly with Ctrl+P → A4)

## Troubleshooting

- **Wrong Bill From** — the plugin always uses Jon Revill Flooring; if another name appears, restart the session
- **Wrong totals** — describe the amounts as "subtotal £X, VAT £Y, total £Z" to be explicit
- **Script errors** — run `npm install` inside `scripts/` if node_modules is missing
