#!/usr/bin/env node

/**
 * Fix weak assertions in user-routes.test.ts
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', '__tests__', 'user-routes.test.ts');

console.log('🔧 Fixing weak assertions in user-routes.test.ts...');

let content = fs.readFileSync(filePath, 'utf8');

// Track changes
let changes = 0;

// Pattern 1: Success tests that should expect 200
const successPattern = /expect\(\[200, 404, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 200\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', true\);\s*expect\(response\.body\)\.toHaveProperty\('([^']+)'\);\s*(\/\/.*)?\s*\}\s*\);/g;
content = content.replace(successPattern, (match, property, comment) => {
  changes++;
  const commentText = comment ? `\n      ${comment.trim()}` : '';
  return `// Should succeed with proper response structure${commentText}
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('${property}');`
});

// Pattern 2: Error tests that should expect 403
const error403Pattern = /expect\(\[403, 404, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 403\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', false\);\s*expect\(response\.body\)\.toHaveProperty\('message'\);\s*\}\s*\);/g;
content = content.replace(error403Pattern, (match) => {
  changes++;
  return `// Should be denied access
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');`
});

// Pattern 3: Authentication required tests
const authPattern = /expect\(\[401, 500\]\)\.toContain\(response\.status\);/g;
content = content.replace(authPattern, (match) => {
  changes++;
  return `// Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');`
});

// Pattern 4: Generic success tests without specific property
const genericSuccessPattern = /expect\(\[200, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 200\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', true\);\s*(\/\/.*)?\s*\}\s*\);/g;
content = content.replace(genericSuccessPattern, (match, comment) => {
  changes++;
  const commentText = comment ? `\n      ${comment.trim()}` : '';
  return `// Should succeed${commentText}
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);`
});

// Pattern 5: 404 tests
const notFoundPattern = /expect\(\[404, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 404\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', false\);\s*expect\(response\.body\)\.toHaveProperty\('message'\);\s*\}\s*\);/g;
content = content.replace(notFoundPattern, (match) => {
  changes++;
  return `// Should return not found
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');`
});

// Pattern 6: 201 Created tests
const createdPattern = /expect\(\[201, 400, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 201\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', true\);\s*expect\(response\.body\)\.toHaveProperty\('([^']+)'\);\s*(\/\/.*)?\s*\}\s*\);/g;
content = content.replace(createdPattern, (match, property, comment) => {
  changes++;
  const commentText = comment ? `\n      ${comment.trim()}` : '';
  return `// Should create successfully${commentText}
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('${property}');`
});

// Pattern 7: 400 Bad Request tests
const badRequestPattern = /expect\(\[400, 401, 500\]\)\.toContain\(response\.status\);\s*if \(response\.status === 400\) \{\s*expect\(response\.body\)\.toHaveProperty\('success', false\);\s*expect\(response\.body\)\.toHaveProperty\('message'\);\s*\}\s*\);/g;
content = content.replace(badRequestPattern, (match) => {
  changes++;
  return `// Should return bad request
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');`
});

if (changes > 0) {
  fs.writeFileSync(filePath, content);
  console.log(`✅ Fixed ${changes} weak assertions`);
} else {
  console.log('⏭️  No changes needed');
}

console.log('🎉 Done!');




