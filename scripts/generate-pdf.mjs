import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { jsPDF } from 'jspdf';

const VAT_RATE = 0.2;

function fail(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { input: null, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') {
      const value = argv[i + 1] ?? null;
      if (!value || value.startsWith('--')) {
        fail('Missing value for --input. Usage: --input <invoice.json>');
      }
      args.input = value;
      i += 1;
      continue;
    }
    if (token === '--output') {
      const value = argv[i + 1] ?? null;
      if (!value || value.startsWith('--')) {
        fail('Missing value for --output. Usage: --output <invoice.pdf>');
      }
      args.output = value;
      i += 1;
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('Usage: node generate-pdf.mjs [--input <invoice.json>] [--output <invoice.pdf>]');
      process.exit(0);
    }
    fail(`Unknown argument: ${token}`);
  }

  if (args.input === '' || args.output === '') {
    fail('Invalid CLI arguments. Expected non-empty values for --input/--output.');
  }

  return args;
}

function isInputFromPipe() {
  return !process.stdin.isTTY;
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function parseJson(raw, sourceLabel) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON from ${sourceLabel}: ${error.message}`);
  }
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function sanitizeFilename(value) {
  const normalized = String(value ?? 'invoice')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return normalized || 'invoice';
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(toNumber(amount));
}

function formatDateBritish(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeInvoice(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('Invoice payload must be a JSON object.');
  }

  const invoice = { ...input };
  invoice.invoiceNumber = String(invoice.invoiceNumber ?? '').trim() || 'INV-001';
  invoice.date = toIsoDate(invoice.date);
  if (!invoice.dueDate) {
    invoice.dueDate = addDays(invoice.date, 14);
  } else {
    invoice.dueDate = toIsoDate(invoice.dueDate, new Date(invoice.date));
  }

  if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
    fail('Invoice must include at least one item in "items" array.');
  }

  invoice.items = invoice.items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      fail(`Invalid item at index ${index}. Each item must be an object.`);
    }

    const normalizedItem = { ...item };
    normalizedItem.desc = String(normalizedItem.desc ?? '').trim() || '-';
    normalizedItem.qty = toNumber(normalizedItem.qty, 0);
    normalizedItem.price = toNumber(normalizedItem.price, 0);

    if (normalizedItem.qty < 0 || normalizedItem.price < 0) {
      fail(`Invalid item at index ${index}. Quantity and price must be non-negative.`);
    }

    if (normalizedItem.lineTotal === undefined || normalizedItem.lineTotal === null || normalizedItem.lineTotal === '') {
      normalizedItem.lineTotal = normalizedItem.qty * normalizedItem.price;
    } else {
      normalizedItem.lineTotal = toNumber(normalizedItem.lineTotal, normalizedItem.qty * normalizedItem.price);
    }

    return normalizedItem;
  });

  const computedSubtotal = invoice.items.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
  if (invoice.subtotal === undefined || invoice.subtotal === null || invoice.subtotal === '') {
    invoice.subtotal = computedSubtotal;
  } else {
    invoice.subtotal = toNumber(invoice.subtotal, computedSubtotal);
  }

  invoice.includeVat = Boolean(invoice.includeVat);
  const computedVat = invoice.includeVat ? invoice.subtotal * VAT_RATE : 0;
  if (invoice.vat === undefined || invoice.vat === null || invoice.vat === '') {
    invoice.vat = computedVat;
  } else {
    invoice.vat = toNumber(invoice.vat, computedVat);
  }

  const computedTotal = invoice.subtotal + invoice.vat;
  if (invoice.total === undefined || invoice.total === null || invoice.total === '') {
    invoice.total = computedTotal;
  } else {
    invoice.total = toNumber(invoice.total, computedTotal);
  }

  invoice.customFields = Array.isArray(invoice.customFields)
    ? invoice.customFields
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          name: String(f.name ?? '').trim(),
          value: String(f.value ?? '').trim()
        }))
        .filter((f) => f.name && f.value)
    : [];

  return invoice;
}

function drawInvoicePdf(invoice, outputPath) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const footerReserve = 15;
  const bodyBottomLimit = pageHeight - margin - footerReserve;

  let y = margin;
  const darkBlue = [44, 62, 80];
  const lightBlue = [52, 152, 219];
  const white = [255, 255, 255];
  const gray = [127, 140, 141];
  const darkGray = [85, 85, 85];
  const lightGray = [238, 238, 238];
  const lineHeight = 5;
  const tableX = margin;
  const colWidths = [86, 14, 30, 40];
  const maxDescWidth = colWidths[0] - 6;
  const tableHeaderHeight = 10;

  const setBodyFont = () => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
  };

  const ensureSpace = (requiredHeight, options = {}) => {
    if (y + requiredHeight <= bodyBottomLimit) return;
    doc.addPage();
    y = margin;
    if (typeof options.onNewPage === 'function') {
      options.onNewPage();
    }
  };

  const drawTableHeader = () => {
    doc.setFillColor(...darkBlue);
    doc.rect(tableX, y, contentWidth, tableHeaderHeight, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...white);
    let headerColX = tableX + 3;
    doc.text('Description', headerColX, y + 7);
    headerColX += colWidths[0];
    doc.text('Qty', headerColX + colWidths[1] / 2, y + 6, { align: 'center' });
    headerColX += colWidths[1];
    doc.text('Unit', headerColX + colWidths[2] - 3, y + 6, { align: 'right' });
    headerColX += colWidths[2];
    doc.text('Amount', headerColX + colWidths[3] - 3, y + 6, { align: 'right' });
    y += tableHeaderHeight;
  };

  const handleTablePageBreak = () => {
    drawTableHeader();
    y += 4;
    setBodyFont();
  };

  const fromName = String(invoice.fromName ?? '').trim() || 'Business Name';
  const fromAddress1 = String(invoice.fromAddress1 ?? '').trim();
  const fromAddress2 = String(invoice.fromAddress2 ?? '').trim();
  const fromCity = String(invoice.fromCity ?? '').trim();
  const fromPostcode = String(invoice.fromPostcode ?? '').trim();
  const fromPhone = String(invoice.fromPhone ?? '').trim();
  const fromEmail = String(invoice.fromEmail ?? '').trim();

  const toName = String(invoice.toName ?? '').trim() || 'Customer Name';
  const toAddress1 = String(invoice.toAddress1 ?? '').trim();
  const toAddress2 = String(invoice.toAddress2 ?? '').trim();
  const toCity = String(invoice.toCity ?? '').trim();
  const toPostcode = String(invoice.toPostcode ?? '').trim();
  const toPhone = String(invoice.toPhone ?? '').trim();
  const toEmail = String(invoice.toEmail ?? '').trim();

  const invoiceNumber = invoice.invoiceNumber;
  const orderNumber = String(invoice.orderNumber ?? '').trim();
  const invoiceDate = formatDateBritish(invoice.date);
  const dueDate = formatDateBritish(invoice.dueDate);
  const vatRegNumber = String(invoice.vatRegNumber ?? '').trim();
  const includeVat = Boolean(invoice.includeVat);
  const customFields = invoice.customFields;
  const notes = String(invoice.notes ?? '').trim();
  const tagline = String(invoice.businessTagline ?? '').trim();

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkBlue);
  doc.text(fromName, margin, y);

  if (tagline) {
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...gray);
    doc.text(tagline, margin, y);
  }

  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkBlue);
  doc.text('INVOICE', pageWidth - margin, margin, { align: 'right' });

  y += 6;
  doc.setDrawColor(...darkBlue);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);

  y += 8;
  const sectionStartY = y;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkBlue);
  doc.text('FROM', margin, y);
  doc.setDrawColor(...lightBlue);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 2, margin + 20, y + 2);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkBlue);
  doc.text(fromName, margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkGray);

  [fromAddress1, fromAddress2, fromCity, fromPostcode].filter(Boolean).forEach((line) => {
    doc.text(line, margin, y);
    y += 4;
  });
  if (fromPhone) {
    doc.text(`Tel: ${fromPhone}`, margin, y);
    y += 4;
  }
  if (fromEmail) {
    doc.text(fromEmail, margin, y);
    y += 4;
  }

  let toY = sectionStartY;
  const toX = pageWidth / 2 + 10;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkBlue);
  doc.text('BILL TO', toX, toY);
  doc.setDrawColor(...lightBlue);
  doc.line(toX, toY + 2, toX + 25, toY + 2);

  toY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkBlue);
  doc.text(toName, toX, toY);
  toY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkGray);
  [toAddress1, toAddress2, toCity, toPostcode].filter(Boolean).forEach((line) => {
    doc.text(line, toX, toY);
    toY += 4;
  });
  if (toPhone) {
    doc.text(`Tel: ${toPhone}`, toX, toY);
    toY += 4;
  }
  if (toEmail) {
    doc.text(toEmail, toX, toY);
    toY += 4;
  }

  y = Math.max(y, toY) + 6;
  doc.setFontSize(9);
  doc.setTextColor(...darkGray);
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Date:', pageWidth - margin - 50, y);
  doc.setFont('helvetica', 'normal');
  doc.text(invoiceDate, pageWidth - margin, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Due Date:', pageWidth - margin - 50, y);
  doc.setFont('helvetica', 'normal');
  doc.text(dueDate, pageWidth - margin, y, { align: 'right' });

  const referencePairs = [];
  referencePairs.push({ label: 'Invoice Number', value: invoiceNumber });
  if (orderNumber) referencePairs.push({ label: 'Order Number', value: orderNumber });
  if (vatRegNumber) referencePairs.push({ label: 'VAT Reg number', value: vatRegNumber });
  customFields.forEach((field) => referencePairs.push({ label: field.name, value: field.value }));

  if (referencePairs.length) {
    y += 6;
    doc.setFontSize(9);
    referencePairs.forEach((pair) => {
      ensureSpace(5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkGray);
      doc.text(`${pair.label}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(pair.value), margin + 50, y);
      y += 5;
    });
  }

  y += 6;
  ensureSpace(tableHeaderHeight + 4);
  drawTableHeader();
  y += 4;
  setBodyFont();

  if (invoice.items.length === 0) {
    ensureSpace(12, { onNewPage: handleTablePageBreak });
    const emptyY = y + 6;
    doc.setTextColor(...gray);
    doc.text('No items added', margin + contentWidth / 2, emptyY, { align: 'center' });
    y = emptyY + 6;
    setBodyFont();
  } else {
    invoice.items.forEach((item) => {
      const descLines = doc.splitTextToSize(String(item.desc ?? '-'), maxDescWidth);
      const rowCoreHeight = Math.max(descLines.length * lineHeight, lineHeight);
      const rowHeight = rowCoreHeight + 4;
      ensureSpace(rowHeight + 2, { onNewPage: handleTablePageBreak });
      const rowTop = y;
      let textY = rowTop + lineHeight + 1;

      descLines.forEach((line) => {
        doc.text(line, tableX + 3, textY);
        textY += lineHeight;
      });

      const qtyX = tableX + colWidths[0];
      const unitX = qtyX + colWidths[1];
      const amountX = unitX + colWidths[2];
      const valueY = rowTop + lineHeight + 1;

      doc.text(String(item.qty), qtyX + colWidths[1] / 2, valueY, { align: 'center' });
      doc.text(formatCurrency(item.price), unitX + colWidths[2] - 3, valueY, { align: 'right' });
      doc.text(formatCurrency(item.lineTotal), amountX + colWidths[3] - 3, valueY, { align: 'right' });

      y = rowTop + rowHeight;
      doc.setDrawColor(...lightGray);
      doc.setLineWidth(0.3);
      doc.line(tableX, y, tableX + contentWidth, y);
      y += 2;
    });
  }

  y += 8;
  ensureSpace(30);
  const totalsX = pageWidth - margin - 70;
  const totalsValueX = pageWidth - margin;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(198, 40, 40);
  doc.text('Reverse VAT when applies', totalsX, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkGray);
  doc.text('Subtotal:', totalsX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCurrency(invoice.subtotal), totalsValueX, y, { align: 'right' });

  if (includeVat) {
    y += 6;
    doc.setTextColor(...gray);
    doc.text('VAT (20%):', totalsX, y);
    doc.text(formatCurrency(invoice.vat), totalsValueX, y, { align: 'right' });
  }

  y += 8;
  doc.setDrawColor(...darkBlue);
  doc.setLineWidth(0.5);
  doc.line(totalsX - 5, y - 4, totalsValueX, y - 4);
  doc.line(totalsX - 5, y + 4, totalsValueX, y + 4);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkBlue);
  doc.text('Total:', totalsX, y + 1);
  doc.text(formatCurrency(invoice.total), totalsValueX, y + 1, { align: 'right' });

  if (notes) {
    y += 8;
    const noteLines = doc.splitTextToSize(notes, contentWidth - 16);
    const notesHeight = noteLines.length * 4 + 14;
    ensureSpace(notesHeight + 2);
    doc.setFillColor(249, 249, 249);
    doc.setDrawColor(...lightBlue);
    doc.setLineWidth(1);
    doc.rect(margin, y, contentWidth, notesHeight, 'F');
    doc.line(margin, y, margin, y + notesHeight);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkBlue);
    doc.text('Notes & Payment Details', margin + 6, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    doc.setFontSize(8);
    noteLines.forEach((line) => {
      doc.text(line, margin + 6, y);
      y += 4;
    });
    setBodyFont();
  }

  const footerY = pageHeight - 15;
  doc.setDrawColor(...lightGray);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...gray);
  doc.text('Thank you for your business', pageWidth / 2, footerY, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  if (vatRegNumber) {
    doc.text(`VAT Reg number: ${vatRegNumber}`, margin, footerY - 8);
  }

  const outputBuffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(outputPath, outputBuffer);
}

function resolveOutputPath(parsedArgs, invoice) {
  if (parsedArgs.output) {
    return path.resolve(process.cwd(), parsedArgs.output);
  }
  const safeInvoiceNumber = sanitizeFilename(invoice.invoiceNumber);
  return path.resolve(process.cwd(), `invoice-${safeInvoiceNumber}.pdf`);
}

async function loadInputJson(args) {
  if (args.input) {
    const fullPath = path.resolve(process.cwd(), args.input);
    if (!fs.existsSync(fullPath)) {
      fail(`Input file not found: ${fullPath}`);
    }
    const raw = fs.readFileSync(fullPath, 'utf8');
    return parseJson(raw, `file ${fullPath}`);
  }

  if (!isInputFromPipe()) {
    fail('No --input provided and no stdin detected. Provide JSON with --input or pipe JSON into stdin.');
  }

  const raw = await readStdin();
  if (!raw || !raw.trim()) {
    fail('No --input provided and stdin was empty.');
  }
  return parseJson(raw, 'stdin');
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const input = await loadInputJson(args);
    const invoice = normalizeInvoice(input);
    const outputPath = resolveOutputPath(args, invoice);
    drawInvoicePdf(invoice, outputPath);
    console.log(`PDF generated: ${outputPath}`);
  } catch (error) {
    fail(error?.message ?? String(error));
  }
}

await main();