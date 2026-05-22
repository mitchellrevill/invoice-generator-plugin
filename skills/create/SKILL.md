---
description: >
  Create professional invoices as PDF and HTML for Jon Revill Flooring.
  Triggers: "create invoice", "generate invoice", "invoice for [client]",
  "make an invoice", uploading handwritten notes to turn into invoices,
  "batch invoices", "invoice these jobs".
---

# Invoice Create Skill

Transform billing details into a flat script-aligned invoice JSON, then generate both PDF and HTML outputs.

**Always read `known-clients.md` before doing anything else** — it contains the default sender (Bill From) and all client address presets.

Reference files:
- Address book: `invoice-generator-plugin/skills/create/reference/known-clients.md`
- Schema + amount rules: `invoice-generator-plugin/skills/create/reference/invoice-schema.md`
- PDF script: `invoice-generator-plugin/scripts/generate-pdf.mjs`
- HTML script: `invoice-generator-plugin/scripts/generate-html.mjs`

---

## Step 1 — Determine invoice number(s)

Before building any invoice:
1. Scan the user's output/invoice directory for files named `invoice-NNNN.pdf` or `invoice-NNNN.html`
2. Find the highest number and add 1 for each new invoice
3. If none found, ask the user what number to start from
4. Use the plain number as `invoiceNumber` (e.g. `7068` — not `INV-7068`)
5. For batches, increment sequentially: 7068, 7069, 7070…

---

## Step 2 — Auto-fill sender (Bill From)

**Always** populate `from*` fields from the **Default Sender** in `known-clients.md`. Never ask the user. Only override if the user explicitly specifies a different sender.

---

## Step 3 — Identify recipient (Bill To)

1. Check **Client Presets** in `known-clients.md` for a partial/case-insensitive name match
2. If matched, silently populate all available `to*` fields
3. If not found, use web search to look up the business address; confirm with user before using
4. Ask only for fields still missing that are genuinely required

---

## Step 4 — Amount interpretation (CRITICAL — read `invoice-schema.md`)

When you have a list of monetary values, **never assume they are all separate line items**. Apply these checks first:

**Check A — Subtotal / VAT / Total pattern:**
If you have 3 values and `value1 + value2 ≈ value3`, interpret as:
- `subtotal = value1`, `vat = value2`, `total = value3`
- Set all three explicitly in the JSON; do NOT add them as items

Example: `£1340 / £268 / £1608` → 1340+268=1608 ✓ → subtotal/vat/total

**Check B — Subtotal / Total with implicit VAT:**
If you have 2 values and `value1 * 1.2 ≈ value2`, interpret as:
- `subtotal = value1`, `total = value2`, `vat = total - subtotal`

Example: `£320 / £384` → 320×1.2=384 ✓ → subtotal/total, vat=64

**Check C — Multiple subtotals + total:**
If you have N values and the last one equals the sum of all others, the last is the total.

**Only treat all values as independent line items if none of A/B/C match.**

---

## Step 5 — Build and generate

1. Normalise all field types (numbers as numbers, dates as ISO strings)
2. Use flat keys only — see `invoice-schema.md`
3. Do NOT include `vatRegNumber` (hardcoded in scripts)
4. Write JSON to a temp file (e.g. `/tmp/invoice-7068.json`)
5. Run both scripts:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/generate-pdf.mjs --input <json> --output <pdf>
   node ${CLAUDE_PLUGIN_ROOT}/scripts/generate-html.mjs --input <json> --output <html>
   ```
6. Report file locations; if a script fails, show stderr and likely cause

---

## Handwritten note rules

### Page header = default Bill To
- Company name at top-left of the page = Bill To for all invoices on that page
- Look it up in `known-clients.md`; if not found, use web search
- Each horizontal line across the page = new invoice

### Individual address override
- If a section has its own full name + address block, use THAT as the `to*` fields for that invoice
- A bare property address (e.g. "73 Danewood Avenue", "Woodside Flat 26") = **job location, not a billing address**
  - Put it in `customFields`: `{ "name": "Job Location", "value": "73 Danewood Avenue" }`

### Numbers in the notes
- Right-margin numbers (7070, 7071…) = `invoiceNumber`
- Reference codes (VO2778/001, Order 456337) = `orderNumber`
- "Revs/Reus VAT applies" or "VAT applies" = `includeVat: true`
- No VAT note = `includeVat: false`

### Monetary values — always apply Step 4 before building items

### Verify before generating (batch mode)
Present a summary table — invoice number, Bill To, job location, amount, VAT — and wait for confirmation before running scripts.

---

## Guardrails

- Never invent legally sensitive data (names, addresses, amounts); ask if unknown
- Flat keys only — no nested `sender`, `billTo`, `lineItems`
- Generate both PDF and HTML unless user asks for only one
- Ambiguous dates → ask before assuming
