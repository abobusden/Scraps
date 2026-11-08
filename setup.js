// Раскладывает плоские файлы (server__db.js -> server/db.js) по папкам. Запускается на Render перед npm install.
const fs = require('fs'), path = require('path');
let n = 0;
for (const f of fs.readdirSync(__dirname)) {
  if (!f.includes('__')) continue;
  const dest = path.join(__dirname, ...f.split('__'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(path.join(__dirname, f), dest); n++;
}
fs.mkdirSync(path.join(__dirname, 'server/data'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'server/uploads'), { recursive: true });
console.log('setup: разложено файлов:', n);
