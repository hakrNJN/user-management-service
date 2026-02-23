const fs = require('fs');
const lines = fs.readFileSync('test-out.txt', 'utf8').split('\n');
const fails = lines.filter(l => l.startsWith('FAIL ')).map(l => l.trim().split(' ')[1]);
fs.writeFileSync('failed-tests.txt', fails.join('\n'));
console.log(`Extracted ${fails.length} failed tests.`);
