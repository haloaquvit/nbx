#!/usr/bin/env node

/**
 * Bundle optimization script
 * Run with: node optimize-bundle.js
 */

const fs = require('fs');
const path = require('path');

// Find large imports and suggest optimizations
function analyzeImports(directory) {
  const results = {
    heavyImports: [],
    unusedImports: [],
    suggestions: []
  };

  function scanFile(filePath) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Check for heavy imports
        if (line.includes('import * as')) {
          results.heavyImports.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            import: line.trim(),
            suggestion: 'Use specific imports instead of * imports'
          });
        }
        
        // Check for potentially heavy libraries
        const heavyLibraries = ['lodash', 'moment', 'date-fns', 'recharts'];
        heavyLibraries.forEach(lib => {
          if (line.includes(`from "${lib}"`) && !line.includes(`from "${lib}/`)) {
            results.suggestions.push({
              file: path.relative(process.cwd(), filePath),
              line: index + 1,
              current: line.trim(),
              suggestion: `Import specific functions from ${lib} instead of the whole library`
            });
          }
        });
        
        // Check for unused console.log in production builds
        if (line.includes('console.log') && !line.includes('process.env.NODE_ENV')) {
          results.suggestions.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            current: line.trim(),
            suggestion: 'Wrap console.log in development check or use devLog utility'
          });
        }
      });
    } catch (error) {
      console.warn(`Could not read file: ${filePath}`);
    }
  }

  function scanDirectory(dir) {
    try {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          scanDirectory(fullPath);
        } else if (stat.isFile()) {
          scanFile(fullPath);
        }
      });
    } catch (error) {
      console.warn(`Could not scan directory: ${dir}`);
    }
  }

  scanDirectory(directory);
  return results;
}

// Create optimized vite config suggestions
function generateViteOptimizations() {
  return `
// Add to vite.config.ts for better optimization
export default defineConfig({
  build: {
    // Optimize chunk sizes
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          'query-vendor': ['@tanstack/react-query'],
          'date-vendor': ['date-fns'],
          'chart-vendor': ['recharts'],
        },
      },
    },
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      },
    },
    // Set chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'date-fns',
    ],
    exclude: [
      // Large libraries that should be loaded on demand
      'recharts',
    ],
  },
});`;
}

// Generate tree-shaking friendly imports guide
function generateTreeShakingGuide() {
  return `
# Tree-Shaking Optimization Guide

## ✅ Good Imports (Tree-shakable)
\`\`\`typescript
// Specific imports
import { format, parseISO } from 'date-fns'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Specific lodash functions
import debounce from 'lodash/debounce'
import isEqual from 'lodash/isEqual'
\`\`\`

## ❌ Bad Imports (Not tree-shakable)
\`\`\`typescript
// Namespace imports
import * as React from 'react'
import * as dateFns from 'date-fns'

// Default imports of large libraries
import _ from 'lodash'
import moment from 'moment'

// Importing entire UI libraries
import * from '@radix-ui/react-dialog'
\`\`\`

## 🔧 Code Splitting Patterns
\`\`\`typescript
// Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'))
const AdminPanel = lazy(() => import('./AdminPanel'))

// Lazy load utilities
const heavyUtil = await import('./heavyUtil')
const result = heavyUtil.processData(data)
\`\`\`

## 📦 Bundle Analysis Commands
\`\`\`bash
# Analyze bundle size
npm run build
npx vite-bundle-analyzer dist

# Check for duplicate dependencies
npm ls --depth=0
npx duplicate-package-checker-webpack-plugin
\`\`\`
`;
}

// Main execution
function main() {
  console.log('🔍 Analyzing bundle optimization opportunities...\n');
  
  const srcPath = path.join(process.cwd(), 'src');
  const analysis = analyzeImports(srcPath);
  
  console.log('📊 Analysis Results:\n');
  
  if (analysis.heavyImports.length > 0) {
    console.log('🚨 Heavy Imports Found:');
    analysis.heavyImports.forEach(item => {
      console.log(`  ${item.file}:${item.line} - ${item.import}`);
      console.log(`    💡 ${item.suggestion}\n`);
    });
  }
  
  if (analysis.suggestions.length > 0) {
    console.log('💡 Optimization Suggestions:');
    analysis.suggestions.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.file}:${item.line}`);
      console.log(`     Current: ${item.current}`);
      console.log(`     Suggestion: ${item.suggestion}\n`);
    });
    
    if (analysis.suggestions.length > 10) {
      console.log(`  ... and ${analysis.suggestions.length - 10} more suggestions\n`);
    }
  }
  
  // Write optimization files
  const optimizationsDir = path.join(process.cwd(), 'optimizations');
  if (!fs.existsSync(optimizationsDir)) {
    fs.mkdirSync(optimizationsDir);
  }
  
  fs.writeFileSync(
    path.join(optimizationsDir, 'vite-config-optimizations.ts'),
    generateViteOptimizations()
  );
  
  fs.writeFileSync(
    path.join(optimizationsDir, 'tree-shaking-guide.md'),
    generateTreeShakingGuide()
  );
  
  fs.writeFileSync(
    path.join(optimizationsDir, 'analysis-results.json'),
    JSON.stringify(analysis, null, 2)
  );
  
  console.log('✅ Optimization files created in ./optimizations/');
  console.log('📁 Files created:');
  console.log('  - vite-config-optimizations.ts');
  console.log('  - tree-shaking-guide.md');
  console.log('  - analysis-results.json');
  
  // Summary
  console.log('\n📈 Summary:');
  console.log(`  Heavy imports: ${analysis.heavyImports.length}`);
  console.log(`  Total suggestions: ${analysis.suggestions.length}`);
  
  if (analysis.suggestions.length > 0) {
    console.log('\n🎯 Top Priority:');
    console.log('  1. Replace * imports with specific imports');
    console.log('  2. Add development checks around console.log statements');
    console.log('  3. Use tree-shakable imports for large libraries');
  } else {
    console.log('\n🎉 No major optimization issues found!');
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyzeImports, generateViteOptimizations, generateTreeShakingGuide };