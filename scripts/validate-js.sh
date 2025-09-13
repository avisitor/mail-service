#!/bin/bash
# JavaScript validation script for mail-service frontend

echo "🔍 Validating JavaScript files..."

# Check syntax with Node.js
echo "1. Checking syntax..."
if node -c src/frontend/main.js; then
    echo "✅ Syntax check passed"
else
    echo "❌ Syntax errors found!"
    exit 1
fi

# Run ESLint
echo "2. Running ESLint..."
if npx eslint src/frontend/*.js; then
    echo "✅ ESLint check passed"
else
    echo "⚠️  ESLint warnings/errors found (see above)"
fi

echo "🎉 JavaScript validation complete!"