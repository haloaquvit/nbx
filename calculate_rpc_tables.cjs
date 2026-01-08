const fs = require('fs');
const path = require('path');

// Path to the SQL dump
const sqlFilePath = String.raw`d:\App\Aquvit Fix - Copy\database\rpc\system_vps_backup_20260109.sql`;
const outputFilePath = String.raw`d:\App\Aquvit Fix - Copy\database\RPC_TABLE_MAPPING.md`;

// List of known tables
const knownTables = [
    "accounts", "accounts_payable", "assets", "asset_maintenance", "audit_logs",
    "closing_entries", "commission_entries", "customers", "employee_advances",
    "employee_salaries", "employees", "expenses", "inventory_batches",
    "inventory_batch_consumptions", "journal_entries", "journal_entry_lines",
    "materials", "material_batches", "material_stock_movements", "nishab_reference",
    "notifications", "products", "product_materials", "product_stock_movements",
    "production_records", "profiles", "purchase_orders", "purchase_order_items",
    "quotations", "role_permissions", "suppliers", "transactions",
    "transaction_items", "transaction_payments", "users"
];

function analyzeRpcTables() {
    if (!fs.existsSync(sqlFilePath)) {
        console.log(`File not found: ${sqlFilePath}`);
        return;
    }

    const content = fs.readFileSync(sqlFilePath, 'utf8');

    // Regex to find function definitions
    const functionPattern = /CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+).*?AS \$function\$([\s\S]*?)\$function\$;/gi;

    const tableMap = {}; // Key: Table, Value: Set of functions

    let match;
    while ((match = functionPattern.exec(content)) !== null) {
        const funcName = match[1];
        const funcBody = match[2].toLowerCase();

        knownTables.forEach(table => {
            // Check for whole word match
            const regex = new RegExp(`\\b${table}\\b`);
            if (regex.test(funcBody)) {
                if (!tableMap[table]) {
                    tableMap[table] = new Set();
                }
                tableMap[table].add(funcName);
            }
        });
    }

    // Generate Markdown
    let mdContent = "# Pemetaan RPC Berdasarkan Tabel (RPC to Table Mapping)\n\n";
    mdContent += "Dokumen ini digenerate otomatis dari backup VPS `system_vps_backup_20260109.sql`.\n";
    mdContent += "Daftar ini menunjukkan tabel-tabel database dan fungsi RPC mana saja yang mengaksesnya (Select/Insert/Update/Delete).\n\n";
    mdContent += "---\n\n";

    const sortedTables = Object.keys(tableMap).sort();

    sortedTables.forEach(table => {
        const functions = Array.from(tableMap[table]).sort();
        mdContent += `## Tabel: \`${table}\`\n\n`;
        mdContent += `Diakses oleh **${functions.length}** fungsi:\n`;
        functions.forEach(func => {
            mdContent += `- \`${func}\`\n`;
        });
        mdContent += "\n";
    });

    // Add list of tables with no RPCs detected (for completeness)
    const unusedTables = knownTables.filter(t => !tableMap[t]);
    if (unusedTables.length > 0) {
        mdContent += "## Tabel Tanpa RPC Eksplisit\n\n";
        unusedTables.forEach(table => {
            mdContent += `- \`${table}\`\n`;
        });
    }

    fs.writeFileSync(outputFilePath, mdContent, 'utf8');
    console.log(`Successfully generated mapping at: ${outputFilePath}`);
}

analyzeRpcTables();
