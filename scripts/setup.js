#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up StockViewer...\n');

// Define directory structure
const directories = [
  'data/csv',
  'data/indicators',
  'data/strategies',
  'data/groups',
  'data/backtest-history',
  'data/datasets',
];

// Define initial JSON files
const jsonFiles = {
  'data/indicators/indicators.json': { indicators: [] },
  'data/strategies/strategies.json': { strategies: [] },
  'data/groups/groups.json': { groups: [] },
  'data/backtest-history/history.json': { entries: [] },
};

// Create directories
console.log('📁 Creating data directories...');
directories.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`  ✓ Created ${dir}`);
  } else {
    console.log(`  ✓ ${dir} already exists`);
  }
});

console.log('\n📝 Creating initial JSON files...');
Object.entries(jsonFiles).forEach(([filePath, content]) => {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
    console.log(`  ✓ Created ${filePath}`);
  } else {
    console.log(`  ✓ ${filePath} already exists`);
  }
});

// Check Python files exist
console.log('\n🐍 Checking Python files...');
const pythonFiles = [
  'data/python/MyTT.py',
  'data/python/executor.py',
  'data/python/backtest-executor.py',
  'data/python/requirements.txt',
];

let pythonFilesOk = true;
pythonFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✓ ${file} found`);
  } else {
    console.log(`  ✗ ${file} missing!`);
    pythonFilesOk = false;
  }
});

console.log('\n✅ Setup complete!\n');

if (!pythonFilesOk) {
  console.log('⚠️  Warning: Some Python files are missing. Make sure you have cloned the repository correctly.\n');
}

console.log('Next steps:');
console.log('  1. Set up Python virtual environment:');
console.log('     python -m venv venv');
console.log('     source venv/bin/activate  # Windows: venv\\Scripts\\activate');
console.log('     pip install pandas numpy');
console.log('');
console.log('  2. Install and run aktools API:');
console.log('     python -m venv aktools-env');
console.log('     source aktools-env/bin/activate');
console.log('     pip install aktools');
console.log('     python -m aktools');
console.log('');
console.log('  3. Start development server:');
console.log('     npm run dev');
console.log('');
