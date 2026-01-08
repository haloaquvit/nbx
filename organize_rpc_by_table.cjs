const fs = require('fs');
const path = require('path');

// Input file
const inputFile = String.raw`d:\App\Aquvit Fix - Copy\database\rpc\all_functions_vps.sql`;
const outputDir = String.raw`d:\App\Aquvit Fix - Copy\database\rpc_by_table`;

// Known tables to match against
const knownTables = [
    "accounts", "accounts_payable", "assets", "asset_maintenance", "audit_logs",
    "closing_periods", "commission_entries", "commission_rules", "customers",
    "customer_pricings", "customer_visits", "employee_advances", "employee_salaries",
    "expenses", "inventory_batches", "inventory_batch_consumptions",
    "journal_entries", "journal_entry_lines", "materials", "material_stock_movements",
    "nishab_reference", "notifications", "products", "product_materials",
    "product_stock_movements", "production_records", "production_errors",
    "profiles", "purchase_orders", "purchase_order_items", "quotations",
    "receivables", "role_permissions", "roles", "suppliers", "supplier_materials",
    "transactions", "transaction_payments", "retasi", "retasi_items",
    "deliveries", "delivery_items", "payroll_records", "zakat_records",
    "branches", "stock_pricings", "bonus_pricings", "advance_repayments",
    "debt_installments", "cash_history", "balance_adjustments", "attendance",
    "payment_history"
];

// Create output directory
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Read input file
const content = fs.readFileSync(inputFile, 'utf8');

// Split by CREATE OR REPLACE FUNCTION
const functionPattern = /CREATE OR REPLACE FUNCTION public\./gi;
const functions = content.split(functionPattern).filter(f => f.trim().length > 0);

console.log(`Found ${functions.length} functions`);

// Map to store functions by table
const tableMap = {};

functions.forEach(funcBody => {
    // Get function name
    const nameMatch = funcBody.match(/^([a-z0-9_]+)\s*\(/i);
    if (!nameMatch) return;

    const funcName = nameMatch[1];
    const fullFunc = 'CREATE OR REPLACE FUNCTION public.' + funcBody;
    const bodyLower = funcBody.toLowerCase();

    // Find which table this function primarily operates on
    let primaryTable = 'general'; // Default category
    let bestMatch = null;
    let bestMatchScore = 0;

    for (const table of knownTables) {
        // Count occurrences
        const regex = new RegExp(`\\b${table}\\b`, 'gi');
        const matches = bodyLower.match(regex);
        const score = matches ? matches.length : 0;

        // Check for direct table operations (INSERT, UPDATE, DELETE, FROM)
        const directOps = new RegExp(`(INSERT INTO|UPDATE|DELETE FROM|FROM)\\s+${table}\\b`, 'gi');
        const directMatches = bodyLower.match(directOps);
        const directScore = directMatches ? directMatches.length * 5 : 0; // Weight direct operations higher

        const totalScore = score + directScore;

        if (totalScore > bestMatchScore) {
            bestMatchScore = totalScore;
            bestMatch = table;
        }
    }

    if (bestMatch && bestMatchScore > 0) {
        primaryTable = bestMatch;
    }

    // Initialize array if needed
    if (!tableMap[primaryTable]) {
        tableMap[primaryTable] = [];
    }

    tableMap[primaryTable].push({
        name: funcName,
        body: fullFunc
    });
});

// Write files for each table
let totalFiles = 0;
for (const [table, funcs] of Object.entries(tableMap)) {
    const fileName = path.join(outputDir, `${table}_rpc.sql`);

    let fileContent = `-- =====================================================\n`;
    fileContent += `-- RPC Functions for table: ${table}\n`;
    fileContent += `-- Generated: ${new Date().toISOString()}\n`;
    fileContent += `-- Total functions: ${funcs.length}\n`;
    fileContent += `-- =====================================================\n\n`;

    for (const func of funcs) {
        fileContent += `-- Function: ${func.name}\n`;
        fileContent += func.body;
        fileContent += '\n\n';
    }

    fs.writeFileSync(fileName, fileContent, 'utf8');
    console.log(`Created ${fileName} with ${funcs.length} functions`);
    totalFiles++;
}

console.log(`\nDone! Created ${totalFiles} files in ${outputDir}`);
