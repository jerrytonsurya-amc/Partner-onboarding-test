/* Readable page for the SQLite tables and the fields each screen captures. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function groupFields(dictionary) {
  const pages = [];
  dictionary.forEach((row) => {
    let page = pages.find((item) => item.page === row.page);
    if (!page) pages.push(page = { page: row.page, sections: [] });
    let section = page.sections.find((item) => item.section === row.section);
    if (!section) page.sections.push(section = { section: row.section, fields: [] });
    section.fields.push(row);
  });
  return pages;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',') + '\n';
}

/* Same columns as each table on the schema page, repeated for every table. */
function schemaToCsv(info) {
  const lines = [];
  (info.tables || []).forEach((table, index) => {
    if (index) lines.push('\n');
    lines.push(csvRow([table.name]));
    lines.push(csvRow([table.rows + (table.rows === 1 ? ' row' : ' rows')]));
    lines.push(csvRow(['Column', 'Type', 'Required', 'Key', 'References']));
    table.columns.forEach((col) => {
      const fk = (table.foreignKeys || []).find((item) => item.from === col.name);
      lines.push(csvRow([
        col.name,
        col.type,
        col.required ? 'Yes' : '',
        col.pk ? 'Primary' : '',
        fk ? fk.table + '.' + fk.to : '',
      ]));
    });
  });
  const pages = groupFields(info.dictionary || []);
  pages.forEach((page) => {
    lines.push('\n');
    lines.push(csvRow([page.page]));
    page.sections.forEach((section) => {
      lines.push(csvRow([section.section]));
      lines.push(csvRow(['Field', 'Label', 'Type', 'Required', 'Stored in', 'Notes']));
      section.fields.forEach((field) => {
        const stored = field.storage_table === 'ephemeral' ? 'Not stored' : field.storage_table + '.' + field.storage_column;
        lines.push(csvRow([
          field.field_key,
          field.label,
          field.data_type,
          field.required ? 'Yes' : '',
          stored,
          field.notes,
        ]));
      });
    });
  });
  return lines.join('');
}

function renderSchemaPage(info) {
  const pages = groupFields(info.dictionary || []);
  const stored = (info.dictionary || []).filter((row) => row.storage_table !== 'ephemeral').length;
  const tableCards = (info.tables || []).map((table) => `<section class="card" id="table-${esc(table.name)}">
    <div class="card-h"><h2>${esc(table.name)}</h2><span class="count">${table.rows} row${table.rows === 1 ? '' : 's'}</span></div>
    <table>
      <thead><tr><th>Column</th><th>Type</th><th>Required</th><th>Key</th><th>References</th></tr></thead>
      <tbody>${table.columns.map((col) => {
        const fk = (table.foreignKeys || []).find((item) => item.from === col.name);
        return `<tr><td class="mono">${esc(col.name)}</td><td>${esc(col.type)}</td><td>${col.required ? 'Yes' : ''}</td><td>${col.pk ? 'Primary' : ''}</td><td>${fk ? esc(fk.table + '.' + fk.to) : ''}</td></tr>`;
      }).join('')}</tbody>
    </table>
  </section>`).join('');

  const fieldCards = pages.map((page) => `<section class="card" id="page-${esc(page.page).replace(/\s+/g, '-').toLowerCase()}">
    <h2>${esc(page.page)}</h2>
    ${page.sections.map((section) => `<h3>${esc(section.section)}</h3>
      <table>
        <thead><tr><th>Field</th><th>Label</th><th>Type</th><th>Required</th><th>Stored in</th><th>Notes</th></tr></thead>
        <tbody>${section.fields.map((field) => `<tr>
          <td class="mono">${esc(field.field_key)}</td>
          <td>${esc(field.label)}</td>
          <td>${esc(field.data_type)}</td>
          <td>${field.required ? 'Yes' : ''}</td>
          <td>${field.storage_table === 'ephemeral' ? '<span class="muted">Not stored</span>' : `<span class="mono">${esc(field.storage_table)}.${esc(field.storage_column)}</span>`}</td>
          <td class="muted">${esc(field.notes)}</td>
        </tr>`).join('')}</tbody>
      </table>`).join('')}
  </section>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data schema</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: Poppins, sans-serif; background: #f4f6fb; color: #14213d; }
  header { background: #002469; color: #fff; padding: 22px 28px; }
  header h1 { margin: 0 0 6px; font-size: 28px; }
  header p { margin: 0; max-width: 760px; color: #d9e2f2; }
  .links { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
  .links a { color: #002469; background: #febd27; text-decoration: none; border-radius: 8px; padding: 8px 12px; font-weight: 600; }
  main { padding: 24px 28px 48px; max-width: 1180px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  .stat { background: #fff; border-radius: 12px; padding: 14px 16px; min-width: 140px; box-shadow: 0 1px 2px rgba(0, 36, 105, .08); }
  .stat b { display: block; font-size: 22px; color: #002469; }
  .jump { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 20px; }
  .jump a { color: #002469; background: #fff; border-radius: 999px; padding: 6px 10px; text-decoration: none; font-size: 13px; }
  .card { background: #fff; border-radius: 14px; padding: 16px 18px 8px; margin: 0 0 16px; box-shadow: 0 1px 2px rgba(0, 36, 105, .08); }
  .card-h { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  h2 { margin: 4px 0 10px; font-size: 20px; color: #002469; }
  h3 { margin: 14px 0 8px; font-size: 15px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 12px; }
  th, td { text-align: left; padding: 8px 8px; border-bottom: 1px solid #e6ebf5; vertical-align: top; }
  th { font-size: 12px; letter-spacing: .02em; text-transform: uppercase; color: #5c6b8a; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
  .muted { color: #5c6b8a; }
  .count { color: #5c6b8a; font-size: 13px; }
  .path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1>Data schema</h1>
  <p>Every field from partner onboarding, QC approval, and the agent portal is stored in SQLite on this machine.</p>
  <p class="path">${esc(info.file)}</p>
  <div class="links">
    <a href="/">Onboarding</a>
    <a href="/approver">Approver panel</a>
    <a href="/agent">Agent portal</a>
    <a href="/data-schema.csv" download="lamf-data-schema.csv">Download CSV</a>
    <a href="/data-schema.pdf" download="lamf-data-schema.pdf">Download PDF</a>
  </div>
</header>
<main>
  <div class="stats">
    <div class="stat"><b>${(info.tables || []).length}</b>Tables</div>
    <div class="stat"><b>${(info.dictionary || []).length}</b>Fields</div>
    <div class="stat"><b>${stored}</b>Stored fields</div>
  </div>
  <h2>Tables</h2>
  <div class="jump">${(info.tables || []).map((table) => `<a href="#table-${esc(table.name)}">${esc(table.name)}</a>`).join('')}</div>
  ${tableCards}
  <h2>Fields by page</h2>
  <div class="jump">${pages.map((page) => `<a href="#page-${esc(page.page).replace(/\s+/g, '-').toLowerCase()}">${esc(page.page)}</a>`).join('')}</div>
  ${fieldCards}
</main>
</body>
</html>`;
}

module.exports = { renderSchemaPage, schemaToCsv };
