import re
import os
from collections import defaultdict

# Path to the SQL dump
sql_file_path = r"d:\App\Aquvit Fix - Copy\database\rpc\system_vps_backup_20260109.sql"
output_file_path = r"d:\App\Aquvit Fix - Copy\database\RPC_TABLE_MAPPING.md"

# List of known tables (to improve accuracy and avoid detecting variables/keywords)
# Based on typical usage seen in previous turns
known_tables = [
    "accounts", "accounts_payable", "assets", "asset_maintenance", "audit_logs",
    "closing_entries", "commission_entries", "customers", "employee_advances",
    "employee_salaries", "employees", "expenses", "inventory_batches",
    "inventory_batch_consumptions", "journal_entries", "journal_entry_lines",
    "materials", "material_batches", "material_stock_movements", "nishab_reference",
    "notifications", "products", "product_materials", "product_stock_movements",
    "production_records", "profiles", "purchase_orders", "purchase_order_items",
    "quotations", "role_permissions", "suppliers", "transactions",
    "transaction_items", "transaction_payments", "users"
]

def analyze_rpc_tables():
    if not os.path.exists(sql_file_path):
        print(f"File not found: {sql_file_path}")
        return

    with open(sql_file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find function definitions
    # Matches: CREATE OR REPLACE FUNCTION public.function_name(...) ... AS $function$ ... $function$;
    function_pattern = re.compile(
        r"CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+).*?AS \$function\$(.*?)\$function\$;",
        re.DOTALL | re.IGNORECASE
    )

    # Dictionary to store Table -> Set(Functions)
    table_map = defaultdict(set)
    # Dictionary to store Function -> Set(Tables) (Optional, for cross check)
    func_map = defaultdict(set)

    matches = function_pattern.findall(content)

    for func_name, func_body in matches:
        # Normalize body for searching
        body_lower = func_body.lower()
        
        for table in known_tables:
            # Simple heuristic: check if table name exists in the body
            # We look for whole words to avoid partial matches (e.g. 'user' in 'users')
            if re.search(r'\b' + re.escape(table) + r'\b', body_lower):
                table_map[table].add(func_name)
                func_map[func_name].add(table)

    # Generate Markdown Output
    with open(output_file_path, 'w', encoding='utf-8') as f:
        f.write("# Pemetaan RPC Berdasarkan Tabel (RPC to Table Mapping)\n\n")
        f.write("Dokumen ini digenerate otomatis dari backup VPS `system_vps_backup_20260109.sql`.\n")
        f.write("Daftar ini menunjukkan tabel-tabel database dan fungsi RPC mana saja yang mengaksesnya (Select/Insert/Update/Delete).\n\n")
        f.write("---\n\n")

        # Sort tables alphabetically
        sorted_tables = sorted(table_map.keys())

        for table in sorted_tables:
            functions = sorted(list(table_map[table]))
            f.write(f"## Tabel: `{table}`\n\n")
            if not functions:
                f.write("*Tidak ada RPC yang terdeteksi mengakses tabel ini secara eksplisit.*\n\n")
            else:
                f.write(f"Diakses oleh **{len(functions)}** fungsi:\n")
                for func in functions:
                    f.write(f"- `{func}`\n")
                f.write("\n")

    print(f"Successfully generated mapping at: {output_file_path}")

if __name__ == "__main__":
    analyze_rpc_tables()
