# Invoice JSON Schema Reference

This document defines the runtime invoice JSON payload consumed by:
- `invoice-generator-plugin/scripts/generate-pdf.mjs`
- `invoice-generator-plugin/scripts/generate-html.mjs`

Both scripts should receive the same flat invoice object structure.

## Runtime script contract (authoritative)

Current scripts consume a **flat payload**. Use these keys:
- `invoiceNumber`, `orderNumber`, `date`, `dueDate`
- `fromName`, `fromAddress1`, `fromAddress2`, `fromCity`, `fromPostcode`, `fromPhone`, `fromEmail`
- `toName`, `toAddress1`, `toAddress2`, `toCity`, `toPostcode`, optional `toPhone`, `toEmail`
- `includeVat`, `vatRegNumber`, `businessTagline`, `notes`
- `items[]` with `desc`, `qty`, `price`, optional `lineTotal`
- optional totals: `subtotal`, `vat`, `total`
- optional `customFields[]` with `name`, `value`

### Tax and locale defaults

- `includeVat=true` => VAT defaults to 20% of subtotal
- `includeVat=false` => VAT defaults to 0
- render locale/currency are fixed in scripts: `en-GB` + `GBP`

### Compatibility behavior

- HTML accepts `items[].description` as fallback for `desc`.
- HTML accepts `customFields[].label` as fallback for `name`.
- PDF is stricter; prefer canonical keys above for reliable dual output.

## Validation checklist

1. Payload is a JSON object.
2. `items` must be a non-empty array for PDF generation.
3. Prefer canonical runtime item keys: `desc`, `qty`, `price`, optional `lineTotal`.
4. Date strings (`date`, `dueDate`) should be parseable (`YYYY-MM-DD` recommended).
5. Monetary values should be finite and non-negative.
6. Derived fields if omitted: `lineTotal`, `subtotal`, `vat`, `total`.
7. VAT semantics are `includeVat` + fixed 20% in current scripts.

## Runtime defaults

When runtime fields are omitted, scripts currently default as follows:
- `invoiceNumber = "INV-001"`
- `date = today`
- `dueDate = date + 14 days`
- `includeVat = false`
- `subtotal = computed from item line totals`
- `vat = includeVat ? subtotal * 0.2 : 0`
- `total = subtotal + vat`
- formatting defaults to `GBP` and `en-GB`

## Minimal script-aligned example

```json
{
  "invoiceNumber": "INV-2026-021",
  "orderNumber": "PO-77831",
  "date": "2026-02-26",
  "dueDate": "2026-03-12",
  "fromName": "Acme Consulting Ltd",
  "fromAddress1": "123 High Street",
  "fromCity": "London",
  "fromPostcode": "EC1A 1BB",
  "fromPhone": "020 7123 4567",
  "fromEmail": "billing@acme.co.uk",
  "toName": "Widget Corporation",
  "toAddress1": "456 Business Park",
  "toCity": "Manchester",
  "toPostcode": "M1 1AA",
  "includeVat": true,
  "vatRegNumber": "GB123456789",
  "customFields": [
    { "name": "Project", "value": "Website Replatform" }
  ],
  "items": [
    { "desc": "Frontend engineering", "qty": 8, "price": 425 },
    { "desc": "Managed hosting", "qty": 1, "price": 180 }
  ]
}
```
