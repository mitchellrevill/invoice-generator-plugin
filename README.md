# Invoice Generator Plugin

Generate professional invoices as both PDF and HTML using Claude skill invocation and a dedicated invoice specialist agent.

## What this plugin provides

- Skill: `/invoice-generator:create`
- Agent: `invoice-specialist`
- Scripts:
  - `scripts/generate-pdf.mjs`
  - `scripts/generate-html.mjs`

## Prerequisites

- Claude CLI installed and available in your terminal.
- Node.js 18+ (Node 20 LTS recommended).
- npm 9+.

### Quick sanity checks

Run these before setup:
- `claude --version`
- `node -v`
- `npm -v`

## Installation

From your repository root:

1. Ensure script dependencies are installed:
   - **Windows (PowerShell):**
     - `Set-Location .\invoice-generator-plugin\scripts`
     - `npm install`
   - **macOS/Linux (bash/zsh):**
     - `cd ./invoice-generator-plugin/scripts`
     - `npm install`
2. Start Claude with the plugin directory:
   - `claude --plugin-dir ./invoice-generator-plugin`

If your shell is not launched in the repo root, use an absolute path:
- Windows example: `claude --plugin-dir "C:\Users\<you>\path\to\invoice-generator-plugin"`
- macOS/Linux example: `claude --plugin-dir /Users/<you>/path/to/invoice-generator-plugin`

## Usage

### Quick create via skill

After launching Claude with the plugin, invoke:

- `/invoice-generator:create`

Then provide invoice details conversationally, for example:

- `/invoice-generator:create create an invoice for Bright Labs, 2 items: Design Sprint £1200 x1 and Hosting £90 x3, VAT on, due in 14 days`

### Structured/batch style request

- `/invoice-generator:create generate invoices for these 3 clients with the attached table and apply VAT only to UK customers`

### Handwritten-note interpretation

- `/invoice-generator:create read this handwritten note image and turn it into a complete invoice draft before generating files`

## Setup notes for script dependencies

The invoice generation scripts rely on npm packages in `invoice-generator-plugin/scripts/package.json`.

- Run `npm install` in `invoice-generator-plugin/scripts` whenever:
  - first setting up the plugin,
  - pulling new script dependency changes,
  - or after deleting `node_modules`.

## Output files

- When `--output` is provided, files are written to that path.
- When `--output` is omitted, scripts write to the **current working directory** (`cwd`) with default names:
  - HTML: `invoice-<invoiceNumber>.html`
  - PDF: `invoice-<invoiceNumber>.pdf`

## Troubleshooting

### Skill not found (`/invoice-generator:create` missing)

- Confirm Claude was started with `--plugin-dir` pointing to `invoice-generator-plugin`.
- Restart Claude after plugin changes.
- Verify plugin folder structure is intact.

### Agent not available (`invoice-specialist` missing)

- Check `invoice-generator-plugin/agents/invoice-specialist.md` exists.
- Ensure markdown frontmatter is valid (`---` block with `name` and `description`).
- Restart Claude session.

### Script execution errors

Common concrete patterns:
- `Error: Invoice payload must be a JSON object.`
  - Cause: input is not an object JSON.
- `Error: Invoice must include at least one item in "items" array.`
  - Cause: `items` missing or empty for PDF generation.
- `Error: No --input provided and no stdin detected. Provide JSON with --input or pipe JSON into stdin.`
  - Cause: neither `--input` nor piped stdin provided.
- `Error: Input file not found: <fullPath>`
  - Cause: wrong `--input` path or wrong cwd.
- `Error: Unknown argument: <token>`
  - Cause: unsupported CLI option.

General fixes:
- Reinstall script dependencies:
  - Windows: run `npm install` inside `invoice-generator-plugin\scripts`
  - macOS/Linux: run `npm install` inside `invoice-generator-plugin/scripts`
- Confirm Node.js version is 18+ (`node -v`).

### Windows path/quoting issues

- Use quotes for paths with spaces:
  - `claude --plugin-dir "C:\Users\<you>\My Projects\invoice-generator-plugin"`
- Prefer absolute paths if relative path resolution is unclear.

### Permission or file write issues

- Ensure output directory is writable.
- Avoid protected system folders.
- Re-run from a normal user-writable project folder.

## Practical workflow tips

- For fastest results, provide: sender details, recipient details, line items, date, due date, and VAT preference in one prompt.
- For handwritten notes, ask for a “confirm fields before output” pass to reduce OCR/interpretation mistakes.
- For batch runs, ask for a per-row validation report before file generation.
