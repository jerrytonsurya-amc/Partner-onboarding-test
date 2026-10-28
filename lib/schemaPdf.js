/* Builds a multi-page PDF of the data schema using the standard PDF fonts. */
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const BOTTOM = 36;

function ascii(value) {
  return String(value ?? '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

function pdfText(value) {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text, width, size) {
  const max = Math.max(8, Math.floor(width / (size * 0.48)));
  const words = ascii(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? line + ' ' + word : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

function schemaToPdf(info) {
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;

  function flush() {
    pages.push(ops);
    ops = [];
    y = PAGE_H - MARGIN;
  }
  function need(height) {
    if (y - height < BOTTOM) flush();
  }
  function draw(text, x, size, bold) {
    ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Td (' + pdfText(text) + ') Tj ET');
  }
  function gap(n) { y -= n; }
  function heading(text, size) {
    need(size + 8);
    draw(text, MARGIN, size, true);
    gap(size + 6);
  }
  function paragraph(text, size, indent) {
    wrap(text, PAGE_W - MARGIN * 2 - (indent || 0), size).forEach((line) => {
      need(size + 3);
      draw(line, MARGIN + (indent || 0), size, false);
      gap(size + 3);
    });
  }

  heading('LAMF data schema', 16);
  paragraph('Fields captured by partner onboarding, QC approval, and the agent portal, and the SQLite tables that store them.', 9, 0);
  paragraph(ascii(info.file || ''), 8, 0);
  gap(8);
  paragraph((info.tables || []).length + ' tables. ' + (info.dictionary || []).length + ' fields.', 9, 0);
  gap(10);

  heading('Fields by page', 13);
  let lastPage = '';
  (info.dictionary || []).forEach((field) => {
    if (field.page !== lastPage) {
      gap(6);
      heading(field.page, 11);
      lastPage = field.page;
    }
    const stored = field.storage_table === 'ephemeral' ? 'Not stored' : field.storage_table + '.' + field.storage_column;
    const title = field.section + '  ·  ' + field.label + (field.required ? '  (required)' : '');
    paragraph(title, 9, 0);
    paragraph(field.field_key + '  ·  ' + field.data_type + '  ·  ' + stored, 8, 8);
    if (field.notes) paragraph(field.notes, 8, 8);
    gap(3);
  });

  gap(8);
  heading('Tables', 13);
  (info.tables || []).forEach((table) => {
    gap(4);
    heading(table.name + '  (' + table.rows + (table.rows === 1 ? ' row)' : ' rows)'), 11);
    table.columns.forEach((col) => {
      const fk = (table.foreignKeys || []).find((item) => item.from === col.name);
      const bits = [col.name, col.type || 'TEXT'];
      if (col.pk) bits.push('primary key');
      if (col.required) bits.push('required');
      if (fk) bits.push('references ' + fk.table + '.' + fk.to);
      paragraph(bits.join('  ·  '), 8, 8);
    });
  });

  if (ops.length) pages.push(ops);

  pages.forEach((commands, index) => {
    commands.push('BT /F1 8 Tf ' + MARGIN + ' 22 Td (Page ' + (index + 1) + ' of ' + pages.length + ') Tj ET');
  });

  const font = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const fontBold = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const objects = [null, '', '', font, fontBold];
  const kids = [];
  pages.forEach((commands) => {
    const stream = commands.join('\n');
    const contentId = objects.length;
    objects.push('<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream');
    const pageId = objects.length;
    kids.push(pageId + ' 0 R');
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentId + ' 0 R >>');
  });
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';

  let out = Buffer.from('%PDF-1.4\n');
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = out.length;
    out = Buffer.concat([out, Buffer.from(i + ' 0 obj\n' + objects[i] + '\nendobj\n')]);
  }
  const xrefAt = out.length;
  let xref = 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  xref += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF';
  return Buffer.concat([out, Buffer.from(xref)]);
}

module.exports = { schemaToPdf };
