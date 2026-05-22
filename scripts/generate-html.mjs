#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const VAT_RATE = 0.2;

function parseArgs(argv) {
  const args = { input: null, output: null, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (token === '--input') {
      args.input = argv[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (token === '--output') {
      args.output = argv[i + 1] ?? null;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function printUsage() {
  console.log(`Usage: node generate-html.mjs [--input <invoice.json>] [--output <invoice.html>]\n\nReads invoice JSON from --input file or stdin and outputs a self-contained HTML invoice.`);
}

async function readFromStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function isInputFromPipe() {
  return !process.stdin.isTTY;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(input) {
  const cleaned = String(input ?? 'invoice')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');

  return cleaned || 'invoice';
}

function toIsoDate(value, fallbackDate = new Date()) {
  if (!value) return fallbackDate.toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallbackDate.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(toNumber(value, 0));
}

function formatDateUk(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function normaliseInvoice(rawInvoice) {
  if (!rawInvoice || typeof rawInvoice !== 'object') {
    throw new Error('Invoice payload must be a JSON object.');
  }

  const items = Array.isArray(rawInvoice.items) ? rawInvoice.items : [];

  const normalisedItems = items.map((item) => {
    const qty = toNumber(item?.qty, 0);
    const price = toNumber(item?.price, 0);
    const lineTotal = Number.isFinite(Number(item?.lineTotal))
      ? Number(item.lineTotal)
      : qty * price;

    return {
      desc: String(item?.desc ?? item?.description ?? '').trim(),
      qty,
      price,
      lineTotal
    };
  });

  const computedSubtotal = normalisedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const includeVat = Boolean(rawInvoice.includeVat);

  const subtotal = Number.isFinite(Number(rawInvoice.subtotal))
    ? Number(rawInvoice.subtotal)
    : computedSubtotal;

  const vat = Number.isFinite(Number(rawInvoice.vat))
    ? Number(rawInvoice.vat)
    : includeVat
      ? subtotal * VAT_RATE
      : 0;

  const total = Number.isFinite(Number(rawInvoice.total))
    ? Number(rawInvoice.total)
    : subtotal + vat;

  const customFields = Array.isArray(rawInvoice.customFields)
    ? rawInvoice.customFields
        .map((field) => ({
          name: String(field?.name ?? field?.label ?? '').trim(),
          value: String(field?.value ?? '').trim()
        }))
        .filter((field) => field.name && field.value)
    : [];

  const date = toIsoDate(rawInvoice.date);
  const dueDate = rawInvoice.dueDate
    ? toIsoDate(rawInvoice.dueDate, new Date(date))
    : addDays(date, 14);

  return {
    invoiceNumber: String(rawInvoice.invoiceNumber ?? 'INV-001').trim() || 'INV-001',
    orderNumber: String(rawInvoice.orderNumber ?? '').trim(),
    date,
    dueDate,
    fromName: String(rawInvoice.fromName ?? '').trim(),
    fromAddress1: String(rawInvoice.fromAddress1 ?? '').trim(),
    fromAddress2: String(rawInvoice.fromAddress2 ?? '').trim(),
    fromCity: String(rawInvoice.fromCity ?? '').trim(),
    fromPostcode: String(rawInvoice.fromPostcode ?? '').trim(),
    fromPhone: String(rawInvoice.fromPhone ?? '').trim(),
    fromEmail: String(rawInvoice.fromEmail ?? '').trim(),
    toName: String(rawInvoice.toName ?? '').trim() || 'Customer Name',
    toAddress1: String(rawInvoice.toAddress1 ?? '').trim(),
    toAddress2: String(rawInvoice.toAddress2 ?? '').trim(),
    toCity: String(rawInvoice.toCity ?? '').trim(),
    toPostcode: String(rawInvoice.toPostcode ?? '').trim(),
    vatRegNumber: String(rawInvoice.vatRegNumber ?? '').trim(),
    notes: String(rawInvoice.notes ?? '').trim(),
    businessTagline: String(rawInvoice.businessTagline ?? '').trim(),
    customFields,
    includeVat,
    items: normalisedItems,
    subtotal,
    vat,
    total
  };
}

function buildInvoiceHtml(invoice) {
  const fromAddressParts = [
    invoice.fromAddress1,
    invoice.fromAddress2,
    invoice.fromCity,
    invoice.fromPostcode,
    invoice.fromPhone ? `Tel: ${invoice.fromPhone}` : '',
    invoice.fromEmail
  ].filter(Boolean);

  const toAddressParts = [
    invoice.toAddress1,
    invoice.toAddress2,
    invoice.toCity,
    invoice.toPostcode
  ].filter(Boolean);

  const itemsRows = invoice.items
    .filter((item) => item.desc || item.qty || item.price || item.lineTotal)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.desc || '-')}</td>
          <td class="col-center">${escapeHtml(item.qty)}</td>
          <td class="col-right">${escapeHtml(formatCurrency(item.price))}</td>
          <td class="col-right">${escapeHtml(formatCurrency(item.lineTotal))}</td>
        </tr>`
    )
    .join('');

  const customFieldsHtml = invoice.customFields.length
    ? `
      <section class="custom-fields">
        <h3>Additional References</h3>
        ${invoice.customFields
          .map(
            (field) => `<p><strong>${escapeHtml(field.name)}:</strong> ${escapeHtml(field.value)}</p>`
          )
          .join('')}
      </section>`
    : '';

  const notesHtml = invoice.notes
    ? `
      <section class="notes">
        <h3>Notes</h3>
        <p>${escapeHtml(invoice.notes)}</p>
      </section>`
    : '';

  const paymentHtml = `
      <section class="payment">
        <h3>Payment Details</h3>
        <div class="payment-grid">
          <div><span class="label">Bank:</span> Virgin Money</div>
          <div><span class="label">Account Number:</span> 21200470</div>
          <div><span class="label">Sort Code:</span> 05-08-38</div>
          <div><span class="label">VAT Reg:</span> 684341620</div>
        </div>
      </section>`;

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    :root {
      --primary: #1f3c88;
      --primary-light: #3366cc;
      --text: #1f2937;
      --text-muted: #6b7280;
      --line: #e5e7eb;
      --surface: #ffffff;
      --surface-soft: #f8fafc;
      --danger: #b91c1c;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background: #f3f4f6;
      line-height: 1.5;
      padding: 24px;
    }

    .page {
      max-width: 900px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      padding: 36px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 3px solid var(--primary);
      padding-bottom: 18px;
      margin-bottom: 24px;
    }

    .branding h1 {
      margin: 0;
      color: var(--primary);
      font-size: 1.9rem;
    }

    .branding .tagline {
      margin: 4px 0 0;
      color: var(--text-muted);
      font-style: italic;
      font-size: 0.9rem;
    }

    .invoice-title {
      text-align: right;
    }

    .invoice-title h2 {
      margin: 0;
      color: var(--primary);
      letter-spacing: 0.06em;
      font-size: 2rem;
    }

    .addresses {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 18px;
    }

    .panel h3 {
      margin: 0 0 8px;
      color: var(--primary);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      border-bottom: 2px solid var(--primary-light);
      display: inline-block;
      padding-bottom: 3px;
    }

    .panel p { margin: 0; white-space: pre-line; }

    .meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 16px;
      font-size: 0.92rem;
    }

    .meta p { margin: 0 0 6px; }

    .custom-fields {
      margin: 8px 0 16px;
      padding: 10px 12px;
      border: 1px dashed var(--line);
      background: var(--surface-soft);
      border-radius: 6px;
      font-size: 0.92rem;
    }

    .custom-fields h3 {
      margin: 0 0 8px;
      color: var(--text-muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .custom-fields p {
      margin: 0 0 4px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 18px;
      font-size: 0.93rem;
    }

    thead th {
      background: var(--primary);
      color: white;
      text-align: left;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 10px 12px;
    }

    td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      vertical-align: top;
    }

    .col-center { text-align: center; width: 80px; }
    .col-right { text-align: right; width: 130px; }

    .empty {
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
    }

    .totals {
      width: 290px;
      margin-left: auto;
      font-size: 0.95rem;
    }

    .reverse-vat {
      color: var(--danger);
      font-weight: 600;
      margin-bottom: 4px;
      font-size: 0.88rem;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--line);
      padding: 8px 0;
    }

    .totals-row.total {
      margin-top: 6px;
      border-top: 2px solid var(--primary);
      border-bottom: 2px solid var(--primary);
      color: var(--primary);
      font-size: 1.08rem;
      font-weight: 700;
      padding: 10px 0;
    }

    .notes {
      margin-top: 16px;
      background: var(--surface-soft);
      border-left: 4px solid var(--primary-light);
      padding: 14px 16px;
      border-radius: 6px;
    }

    .notes h3 {
      margin: 0 0 8px;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .notes p {
      margin: 0;
      white-space: pre-line;
      font-size: 0.93rem;
    }

    .payment {
      margin-top: 16px;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-top: 3px solid var(--primary);
      padding: 14px 16px;
      border-radius: 6px;
    }

    .payment h3 {
      margin: 0 0 10px;
      color: var(--primary);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .payment-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px 24px;
      font-size: 0.9rem;
    }

    .payment-grid .label {
      font-weight: 600;
      color: var(--text-muted);
    }

    .footer {
      margin-top: 24px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    @media (max-width: 760px) {
      body { padding: 10px; }
      .page { padding: 20px; }
      .addresses, .meta { grid-template-columns: 1fr; }
      .invoice-title { text-align: left; }
      .totals { width: 100%; }
      .payment-grid { grid-template-columns: 1fr; }
    }

    @page {
      size: A4 portrait;
      margin: 14mm 12mm;
    }

    @media print {
      html, body {
        background: white !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .page {
        max-width: none !important;
        width: 100% !important;
        border: none !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      .header { break-inside: avoid; }
      tr, .totals, .notes, .payment { break-inside: avoid; }

      thead { display: table-header-group; }

      .payment-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="branding">
        <h1>${escapeHtml(invoice.fromName || 'Business Name')}</h1>
        ${invoice.businessTagline ? `<p class="tagline">${escapeHtml(invoice.businessTagline)}</p>` : ''}
      </div>
      <div class="invoice-title">
        <h2>INVOICE</h2>
      </div>
    </header>

    <section class="addresses">
      <div class="panel">
        <h3>From</h3>
        <p><strong>${escapeHtml(invoice.fromName || 'Business Name')}</strong></p>
        <p>${escapeHtml(fromAddressParts.join('\n') || 'Address')}</p>
      </div>
      <div class="panel">
        <h3>Bill To</h3>
        <p><strong>${escapeHtml(invoice.toName || 'Customer Name')}</strong></p>
        <p>${escapeHtml(toAddressParts.join('\n') || 'Address')}</p>
      </div>
    </section>

    <section class="meta">
      <div>
        <p><strong>Invoice Number:</strong> ${escapeHtml(invoice.invoiceNumber)}</p>
        ${invoice.orderNumber ? `<p><strong>Order Number:</strong> ${escapeHtml(invoice.orderNumber)}</p>` : ''}
      </div>
      <div>
        <p><strong>Invoice Date:</strong> ${formatDateUk(invoice.date)}</p>
        <p><strong>Due Date:</strong> ${formatDateUk(invoice.dueDate)}</p>
      </div>
      <div>
        <p><strong>VAT Reg number:</strong> ${escapeHtml(invoice.vatRegNumber || '-')}</p>
      </div>
    </section>

    ${customFieldsHtml}

    <table aria-label="Invoice line items">
      <thead>
        <tr>
          <th>Description</th>
          <th class="col-center">Qty</th>
          <th class="col-right">Unit Price</th>
          <th class="col-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows || '<tr><td colspan="4" class="empty">No items added</td></tr>'}
      </tbody>
    </table>

    <section class="totals">
      <div class="reverse-vat">Reverse VAT when applies</div>
      <div class="totals-row">
        <span>Subtotal:</span>
        <span>${escapeHtml(formatCurrency(invoice.subtotal))}</span>
      </div>
      ${invoice.includeVat ? `
      <div class="totals-row">
        <span>VAT (20%):</span>
        <span>${escapeHtml(formatCurrency(invoice.vat))}</span>
      </div>` : ''}
      <div class="totals-row total">
        <span>Total:</span>
        <span>${escapeHtml(formatCurrency(invoice.total))}</span>
      </div>
    </section>

    ${notesHtml}

    ${paymentHtml}

    <footer class="footer">
      <div>Thank you for your business</div>
    </footer>
  </main>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.input && !isInputFromPipe()) {
    throw new Error('No --input provided and no stdin detected. Provide JSON with --input or pipe JSON into stdin.');
  }

  const inputJson = args.input
    ? await readFile(path.resolve(process.cwd(), args.input), 'utf8')
    : await readFromStdin();

  if (!inputJson.trim()) {
    throw new Error('No invoice JSON provided. Use --input <file> or pipe JSON via stdin.');
  }

  const parsed = JSON.parse(inputJson);
  const invoice = normaliseInvoice(parsed);
  const html = buildInvoiceHtml(invoice);

  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.resolve(process.cwd(), `invoice-${sanitizeFilename(invoice.invoiceNumber)}.html`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');

  console.log(outputPath);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
