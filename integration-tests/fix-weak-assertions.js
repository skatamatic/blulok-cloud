#!/usr/bin/env node

/**
 * Script to fix weak assertions in integration tests
 * 
 * This script finds and replaces weak assertion patterns with proper assertions
 */

const fs = require('fs');
const path = require('path');

// Patterns to fix
const patterns = [
  {
    // Success tests that should expect 200
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
    // Error tests that should expect specific errors
    pattern: /expect\(\[403, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 403\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', false\);\s*expect\(response\.body\)\.toHaveProperty\('message'\);\s*\}\s*\);/gs,
    replacement: `// Should be denied access
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');`
  }
];

function fixFile(filePath) {
  console.log(`Processing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  patterns.forEach(({ pattern, replacement }) => {
    const matches = content.match(pattern);
    if (matches) {
      content = content.replace(pattern, replacement);
      changes += matches.length;
    }
  });
  
  if (changes > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`  Fixed ${changes} weak assertions`);
  } else {
    console.log(`  No changes needed`);
  }
}

function main() {
  const testDir = path.join(__dirname, 'src', '__tests__');
  const files = fs.readdirSync(testDir)
    .filter(file => file.endsWith('.test.ts'))
    .map(file => path.join(testDir, file));
  
  console.log(`Found ${files.length} test files to process`);
  
  files.forEach(fixFile);
  
  console.log('Done!');
}

if (require.main === module) {
  main();
}




