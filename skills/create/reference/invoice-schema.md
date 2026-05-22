# Invoice JSON Schema Reference

This document defines the runtime invoice JSON payload consumed by:
- `scripts/generate-pdf.mjs`
- `scripts/generate-html.mjs`

Both scripts receive the same flat invoice object.

---

## Flat payload keys (authoritative)

- `invoiceNumber`, `orderNumber`, `date`, `dueDate`
- `fromName`, `fromAddress1`, `fromAddress2`, `fromCity`, `fromPostcode`, `fromPhone`, `fromEmail`
- `toName`, `toAddress1`, `toAddress2`, `toCity`, `toPostcode`, `toPhone` (opt), `toEmail` (opt)
- `includeVat` (boolean), `notes`, `businessTagline`
- `items[]` → each: `desc`, `qty`, `price`, optional `lineTotal`
- Optional overrides: `subtotal`, `vat`, `total`
- `customFields[]` → each: `name`, `value`

**Do NOT include `vatRegNumber`** — it is hardcoded in the scripts.

---

## Defaults

| Field | Default |
|-------|---------|
| `invoiceNumber` | `INV-001` |
| `date` | today |
| `dueDate` | date + 14 days |
| `includeVat` | `false` |
| `subtotal` | sum of item lineTotals |
| `vat` | `includeVat ? subtotal * 0.2 : 0` |
| `total` | `subtotal + vat` |

Locale/currency fixed in scripts: `GBP` + `en-GB`.

---

## Amount interpretation rules (CRITICAL)

When amounts appear on handwritten notes or as a list of numbers, apply this logic **before** building the payload:

### Pattern: three amounts where amount3 ≈ amount1 + amount2
```
£1340
£268
£1608
```
→ Interpret as **subtotal=1340, vat=268, total=1608**. Set all three explicitly. Do NOT treat them as three separate line items.

Verify: `1340 + 268 = 1608` ✓ → confirmed subtotal/VAT/total breakdown.

### Pattern: two amounts where amount2 ≈ amount1 + (amount1 * 0.2)
```
£320
£384
```
→ Interpret as **subtotal=320, total=384**, compute vat=64. Set all three explicitly.

Verify: `320 * 1.2 = 384` ✓ → confirmed subtotal/total with 20% VAT.

### Pattern: two amounts that don't have a ×1.2 relationship
```
£320
£64
£384
```
→ Three values where 320+64=384 → subtotal=320, vat=64, total=384.

### Rule: always check before treating values as separate line items
1. Take the last value (largest or final). Does it equal the sum of the others? → subtotal/VAT/total split.
2. Does the second-to-last × 1.2 equal the last? → subtotal/total, compute VAT.
3. Only treat all values as independent line items if none of the above patterns match.

---

## Minimal valid example

```json
{
  "invoiceNumber": "7068",
  "date": "2026-02-26",
  "dueDate": "2026-03-12",
  "fromName": "Jon Revill Flooring",
  "fromAddress1": "11 Spotswood Place",
  "fromAddress2": "Gleadless Valley",
  "fromCity": "Sheffield",
  "fromPostcode": "S14 1LE",
  "fromEmail": "jonrevillflooring@btinternet.com",
  "toName": "Burngreave Building Co",
  "toAddress1": "80 Clun Street",
  "toCity": "Sheffield",
  "toPostcode": "S4 7JS",
  "includeVat": true,
  "customFields": [{ "name": "Job Location", "value": "73 Danewood Avenue" }],
  "items": [
    { "desc": "Supply and fit Secura to bathroom", "qty": 1, "price": 1340 }
  ],
  "subtotal": 1340,
  "vat": 268,
  "total": 1608
}
```
