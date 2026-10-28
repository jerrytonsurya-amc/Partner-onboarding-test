// Builds the self-contained pages: `node build.js`
//   index.html     partner onboarding journey
//   approver.html  approver panel (QC approval)
//   agent.html     agent portal (sign in with Agent ID / mobile + OTP)
const fs = require('fs');
const path = require('path');

const here = __dirname;
const read = (p) => fs.readFileSync(path.join(here, 'src', p), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

function page({ title, css, app }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b5cab">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css.join('\n')}</style>
</head>
<body>
<div id="root"></div>
<noscript>This application needs JavaScript.</noscript>
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/htm@3.1.1/dist/htm.umd.js"></script>
<script>window.BRAND_LOGO = 'data:image/svg+xml;base64,${Buffer.from(read('logo.svg')).toString('base64')}';</script>
<script>
${safe(read('ui.js'))}
</script>
<script>
${safe(read('persist.js'))}
</script>
<script>
${safe(app)}
</script>
</body>
</html>
`;
}

const pages = [
  { file: 'index.html', title: 'Become a Partner', css: [read('base.css'), read('extra.css'), read('ds.css'), read('ref.css')], app: read('onboarding.js') },
  { file: 'approver.html', title: 'Approver Panel', css: [read('base.css'), read('extra.css'), read('approver.css'), read('ds.css'), read('ref.css')], app: read('approver.js') },
  { file: 'agent.html', title: 'Agent Portal', css: [read('base.css'), read('extra.css'), read('approver.css'), read('agent.css'), read('ds.css'), read('ref.css')], app: read('agent.js') },
];
for (const p of pages) {
  const out = page(p);
  fs.writeFileSync(path.join(here, p.file), out);
  console.log('Built ' + p.file + ' (' + Math.round(out.length / 1024) + ' KB)');
}
