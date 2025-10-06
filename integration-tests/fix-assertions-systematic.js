#!/usr/bin/env node

/**
 * Systematic fix for weak assertions in integration tests
 * 
 * This script replaces common weak assertion patterns with proper assertions
 */

const fs = require('fs');
const path = require('path');

// Common patterns and their fixes
const fixes = [
  {
    name: 'Success tests expecting 200',
    pattern: /expect\(\[200, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 200\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', true\);\s*expect\(response\.body\)\.toHaveProperty\('([^']+)'\);\s*(\/\/.*)?\s*\}\s*\);/gs,
    replacement: (match, property, comment) => {
      const commentText = comment ? `\n      ${comment.trim()}` : '';
      return `// Should succeed with proper response structure${commentText}
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('${property}');`
    }
  },
  {
    name: 'Error tests expecting 403',
    pattern: /expect\(\[403, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 403\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', false\);\s*expect\(response\.body\)\.toHaveProperty\('message'\);\s*\}\s*\);/gs,
    replacement: `// Should be denied access
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');`
  },
  {
    name: 'Generic success tests',
    pattern: /expect\(\[200, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 200\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', true\);\s*(\/\/.*)?\s*\}\s*\);/gs,
    replacement: (match, comment) => {
      const commentText = comment ? `\n      ${comment.trim()}` : '';
      return `// Should succeed${commentText}
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);`
    }
  }
];

function fixFile(filePath) {
  console.log(`\nProcessing ${path.basename(filePath)}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let totalChanges = 0;
  
  fixes.forEach(({ name, pattern, replacement }) => {
    const matches = content.match(pattern);
    if (matches) {
      if (typeof replacement === 'function') {
        content = content.replace(pattern, replacement);
      } else {
        content = content.replace(pattern, replacement);
      }
      totalChanges += matches.length;
      console.log(`  Fixed ${matches.length} ${name}`);
    }
  });
  
  if (totalChanges > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✅ Total changes: ${totalChanges}`);
  } else {
    console.log(`  ⏭️  No changes needed`);
  }
  
  return totalChanges;
}

function main() {
  const testDir = path.join(__dirname, 'src', '__tests__');
  const files = fs.readdirSync(testDir)
    .filter(file => file.endsWith('.test.ts') && !file.includes('widget-layout'))
    .map(file => path.join(testDir, file));
  
  console.log(`🔍 Found ${files.length} test files to process`);
  console.log('📝 Applying systematic fixes...\n');
  
  let totalChanges = 0;
  files.forEach(file => {
    totalChanges += fixFile(file);
  });
  
  console.log(`\n🎉 Done! Fixed ${totalChanges} weak assertions across ${files.length} files`);
  console.log('\nNext steps:');
  console.log('1. Run tests to verify fixes work');
  console.log('2. Manually review and adjust any remaining issues');
  console.log('3. Add more specific assertions based on actual API responses');
}

if (require.main === module) {
  main();
}




