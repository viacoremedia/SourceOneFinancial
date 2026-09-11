const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../../2026 ROUTE 66 Dealer List.xlsx');
console.log('Reading:', filePath);
const workbook = XLSX.readFile(filePath);
console.log('Sheet names:', workbook.SheetNames);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log('Total rows:', data.length);
console.log('Headers:', data[0]);
for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
    console.log(`Row ${i}:`, data[i]);
}
