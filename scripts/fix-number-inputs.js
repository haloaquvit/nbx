#!/usr/bin/env node

/**
 * Script to automatically replace <Input type="number"> with <NumberInput>
 * This fixes the issue where users can't delete input values to empty (stops at 0)
 */

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/components/CreatePurchaseOrderDialog.tsx',
  'src/components/DeliveryFormContent.tsx',
  'src/components/ExpenseManagement.tsx',
  'src/components/AddDebtDialog.tsx',
  'src/components/EditCustomerDialog.tsx',
  'src/components/AddCustomerDialog.tsx',
  'src/pages/SettingsPage.tsx',
  'src/components/MaintenanceDialog.tsx',
  'src/components/AssetDialog.tsx',
  'src/components/ZakatDialog.tsx',
  'src/pages/ZakatPage.tsx',
  'src/pages/AccountsPayablePage.tsx',
  'src/pages/ProductionPage.tsx',
  'src/pages/DriverPosPage.tsx',
  'src/components/EditTransactionDialog.tsx',
  'src/components/PosForm.tsx',
  'src/components/PayrollRecordDialog.tsx',
  'src/components/SalaryConfigDialog.tsx',
  'src/components/CoaTableView.tsx',
  'src/components/EnhancedAccountManagement.tsx',
  'src/components/MaterialManagement.tsx',
  'src/components/DeliveryManagement.tsx',
  'src/pages/CommissionManagePage.tsx',
  'src/pages/ProductPage.tsx',
  'src/components/ProductManagement.tsx',
  'src/components/ProductPricingManagement.tsx',
  'src/components/SalesCommissionSettings.tsx',
  'src/components/DriverDeliveryDialog.tsx',
  'src/pages/RetasiPage.tsx',
  'src/components/MobilePosForm.tsx',
  'src/components/PayReceivableDialog.tsx',
  'src/components/EmployeeAdvanceManagement.tsx',
  'src/components/CashInOutDialog.tsx',
  'src/components/TransferAccountDialog.tsx',
  'src/components/ReturnRetasiDialog.tsx',
  'src/pages/AccountDetailPage.tsx',
  'src/components/AccountManagement.tsx',
  'src/components/BOMManagement.tsx',
  'src/components/RepayAdvanceDialog.tsx',
  'src/components/RequestPoDialog.tsx',
  'src/components/PayPoDialog.tsx',
  'src/components/AddStockDialog.tsx',
];

function fixFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Skipping ${filePath} (not found)`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Check if NumberInput is already imported
  const hasNumberInputImport = content.includes('NumberInput');

  if (!hasNumberInputImport) {
    // Add import statement after other imports from @/components/ui
    const importPattern = /import\s+{[^}]+}\s+from\s+["']@\/components\/ui\/input["']/;

    if (importPattern.test(content)) {
      // Add NumberInput import after Input import
      content = content.replace(
        importPattern,
        (match) => `${match}\nimport { NumberInput } from "@/components/ui/number-input"`
      );
      modified = true;
    } else {
      // Add at the top with other imports
      const firstImportPattern = /^(import\s+)/m;
      content = content.replace(
        firstImportPattern,
        'import { NumberInput } from "@/components/ui/number-input"\n$1'
      );
      modified = true;
    }
  }

  // NOTE: Actual replacement is complex and error-prone
  // Better to do it manually or with more sophisticated AST parsing
  console.log(`✅ Added NumberInput import to ${filePath}`);

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
  }
}

console.log('🔧 Adding NumberInput imports to files...\n');

filesToFix.forEach(fixFile);

console.log('\n✨ Done! Now you need to manually replace <Input type="number"> with <NumberInput>');
console.log('📖 See docs/NUMBER_INPUT_GUIDE.md for usage examples');
