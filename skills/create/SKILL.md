---
description: Create script-aligned invoice JSON (flat contract), ask for missing essentials, and generate PDF + HTML outputs.
---

# Invoice Create Skill

Use this skill to transform user billing details into a **flat, script-aligned invoice JSON** and produce both outputs:
- `invoice-generator-plugin/scripts/generate-pdf.mjs`
- `invoice-generator-plugin/scripts/generate-html.mjs`

## Required payload keys (exact names)

Collect these from the user (ask concise follow-up questions when missing):

At minimum for reliable PDF+HTML generation:
1. `invoiceNumber`
2. `items` with at least one item object using:
   - `desc`
   - `qty`
   - `price`
   - optional `lineTotal`

Strongly recommended keys:
- `dueDate`
- `date`
- `fromName`, `toName`
- address/contact fields (`fromAddress1`, `fromCity`, `fromPostcode`, `fromPhone`, `fromEmail`, `toAddress1`, `toCity`, `toPostcode`)
- `orderNumber`, `vatRegNumber`, `notes`, `businessTagline`, `customFields`
- `includeVat` (boolean)

Reference contract: `invoice-generator-plugin/skills/create/reference/invoice-schema.md`

## Defaults and semantics (must follow scripts)

- UK render defaults are fixed in scripts: **GBP / en-GB**.
- VAT behavior is fixed for now:
   - `includeVat: true` => VAT is 20% of `subtotal` unless explicit `vat` provided
   - `includeVat: false` => VAT defaults to `0`
- If omitted, scripts compute:
   - `subtotal = sum(items[].lineTotal)` (or computed from `qty * price`)
   - `vat = includeVat ? subtotal * 0.2 : 0`
   - `total = subtotal + vat`
- `date` defaults to today; `dueDate` defaults to +14 days.

## Behavior

1. **Gather missing data**
   - If required fields are missing, ask targeted follow-up questions.
   - Do not run generation scripts until required fields are present.

2. **Build canonical invoice JSON**
   - Normalize types (numbers as numbers, dates as ISO-like strings).
   - Use exact flat keys documented above.
   - Compute or verify `subtotal`, `vat`, and `total`.

3. **Write JSON to a temp/input file**
   - Save the final payload as a JSON file (for example in a working temp path).

4. **Generate both outputs**
   - Run PDF generation:
     - `node ${CLAUDE_PLUGIN_ROOT}/scripts/generate-pdf.mjs --input <invoice.json> --output <invoice.pdf>`
   - Run HTML generation:
     - `node ${CLAUDE_PLUGIN_ROOT}/scripts/generate-html.mjs --input <invoice.json> --output <invoice.html>`

5. **Return completion summary**
   - Confirm output file locations for both `.pdf` and `.html`.
   - If script execution fails, report stderr and likely field-level causes.

## Minimal invocation example

User asks:
- “Create invoice INV-2026-0001 for Contoso: one line item ‘Design retainer’ for £1500, issue date 2026-02-26.”

Skill should:
1. Ask only for missing required values (e.g., sender name if omitted).
2. Build minimal valid JSON.
3. Run:
   - `node ${CLAUDE_PLUGIN_ROOT}/scripts/generate-pdf.mjs --input /tmp/inv-2026-0001.json --output /tmp/inv-2026-0001.pdf`
   - `node ${CLAUDE_PLUGIN_ROOT}/scripts/generate-html.mjs --input /tmp/inv-2026-0001.json --output /tmp/inv-2026-0001.html`

## Guardrails

- Keep invoice JSON strictly aligned to `invoice-schema.md` runtime contract.
- Do not use legacy nested keys (`sender`, `billTo`, `lineItems`, nested `tax`) unless you map them to flat runtime keys before generation.
- Prefer canonical item/custom-field keys (`desc`, `qty`, `price`, `lineTotal`, `name`, `value`).
- Never invent legally sensitive party data; ask if unknown.
- If date values are ambiguous, ask a clarifying question.
- Ensure both output formats are attempted unless user explicitly asks for only one.