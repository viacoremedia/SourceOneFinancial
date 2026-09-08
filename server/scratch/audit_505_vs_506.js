const fs = require('fs');

function parseCSV(text) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(current);
      current = '';
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
      row = [];
    } else {
      current += char;
    }
  }
  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

function getIds(filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const rows = parseCSV(content);
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idIdx = header.indexOf('dealer id') !== -1 ? header.indexOf('dealer id') : header.indexOf('dealer_id');
  const ids = [];
  for (let i = 1; i < rows.length; i++) {
    const id = (rows[i][idIdx] || '').trim().toUpperCase();
    if (id) ids.push(id);
  }
  return ids;
}

const v2Ids = getIds('dark_dealers_scrubbed_results_v2.csv');
const m485Ids = getIds('dark_dealers_rep_ready_master_415.csv');
const hr21Ids = getIds('dark_dealers_hard_review_queue.csv');

console.log('v2 total IDs:', v2Ids.length, 'unique:', new Set(v2Ids).size);
console.log('m485 total IDs:', m485Ids.length, 'unique:', new Set(m485Ids).size);
console.log('hr21 total IDs:', hr21Ids.length, 'unique:', new Set(hr21Ids).size);

const setV2 = new Set(v2Ids);
const setM485 = new Set(m485Ids);
const setHr21 = new Set(hr21Ids);

// Overlap between m485 and hr21
const inBoth = [...setM485].filter(id => setHr21.has(id));
console.log('In both m485 and hr21:', inBoth);

// In v2 but neither m485 nor hr21
const inNeither = [...setV2].filter(id => !setM485.has(id) && !setHr21.has(id));
console.log('In v2 but neither m485 nor hr21:', inNeither);

// In m485 or hr21 but not in v2
const notInV2 = [...new Set([...setM485, ...setHr21])].filter(id => !setV2.has(id));
console.log('In m485 or hr21 but not in v2:', notInV2);

// Let's check duplicates within each file
function findDupes(arr) {
  const counts = {};
  arr.forEach(x => counts[x] = (counts[x] || 0) + 1);
  return Object.entries(counts).filter(([, c]) => c > 1);
}
console.log('Dupes in v2:', findDupes(v2Ids));
console.log('Dupes in m485:', findDupes(m485Ids));
console.log('Dupes in hr21:', findDupes(hr21Ids));

// Now let's check dark_dealers_by_rep
const repDir = 'dark_dealers_by_rep';
const reps = fs.readdirSync(repDir).filter(f => fs.statSync(repDir + '/' + f).isDirectory());
let repM485Total = 0;
let repHr21Total = 0;
const allRepM485Ids = [];
const allRepHr21Ids = [];

for (const r of reps) {
  const mFile = `${repDir}/${r}/dark_dealers_rep_ready_master_415.csv`;
  const hFile = `${repDir}/${r}/dark_dealers_hard_review_queue.csv`;
  if (fs.existsSync(mFile)) {
    const ids = getIds(mFile);
    repM485Total += ids.length;
    allRepM485Ids.push(...ids);
  }
  if (fs.existsSync(hFile)) {
    const ids = getIds(hFile);
    repHr21Total += ids.length;
    allRepHr21Ids.push(...ids);
  }
}

console.log('Sum of m485 across all reps:', repM485Total);
console.log('Sum of hr21 across all reps:', repHr21Total);
console.log('Sum of both across all reps:', repM485Total + repHr21Total);
console.log('Unique dealers across all reps m485+hr21:', new Set([...allRepM485Ids, ...allRepHr21Ids]).size);

// Missing from reps?
const allRepCombined = new Set([...allRepM485Ids, ...allRepHr21Ids]);
const missingFromReps = [...setV2].filter(id => !allRepCombined.has(id));
console.log('Missing from reps compared to v2:', missingFromReps);
