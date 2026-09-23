// Single-File HTML Bundler: Inlines CSS and all JS modules into one self-contained HTML file
const fs = require('fs');
const path = require('path');

const projectDir = __dirname;
let html = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');

// Inline CSS
const css = fs.readFileSync(path.join(projectDir, 'css', 'style.css'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="[^"]+">/, `<style>\n${css}\n</style>`);

// Order of JS files to inline
const jsFiles = [
  'data/shrutis.js',
  'data/ragas.js',
  'js/dsp.js',
  'js/tanpura.js',
  'js/canvas.js',
  'js/app.js'
];

let combinedJS = '';
jsFiles.forEach(file => {
  const content = fs.readFileSync(path.join(projectDir, file), 'utf8');
  combinedJS += `\n/* === File: ${file} === */\n` + content + '\n';
});

// Remove script tags and inject single script block before </body>
const scriptRegex = /<script src="[^"]+"><\/script>\s*/g;
html = html.replace(scriptRegex, '');
html = html.replace('</body>', `<script>\n${combinedJS}\n</script>\n</body>`);

// Output standalone.html
const outputPath = path.join(projectDir, 'standalone.html');
fs.writeFileSync(outputPath, html, 'utf8');

console.log(`Success! Created single self-contained file: ${outputPath}`);
console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
