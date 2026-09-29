// gen-readme.js
const fs = require('fs');
const path = require('path');

const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        return d.isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
    });

const links = walk('docs')
    .map((f) => {
        const title = path.basename(f, '.md').replace(/[-_]/g, ' ');
        const url = './' + f.split(path.sep).map(encodeURIComponent).join('/');
        return `- [${title}](${url})`;
    })
    .join('\n');

const readme = `# Multitenant CRM

## Documentation

- [Docs folder](./docs)
${links}
`;

fs.writeFileSync('README.md', readme);
console.log('README.md generated');