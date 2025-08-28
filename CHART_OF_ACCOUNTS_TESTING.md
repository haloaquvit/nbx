# 📊 Chart of Accounts (CoA) - Testing Guide

## 🎯 **OVERVIEW**

Implementasi Chart of Accounts telah selesai dibuat dengan fitur:

✅ **Hierarchical Account Structure** - Struktur akun bertingkat dengan parent-child relationship  
✅ **Standard Account Codes** - Kode akun standar 4 digit (1000, 1100, 1110, dll)  
✅ **Interactive Tree View** - UI Tree view yang bisa di-expand/collapse  
✅ **Normal Balance Support** - Debit/Credit balance sesuai standar akuntansi  
✅ **Account Management** - CRUD operations dengan validasi  
✅ **Import Standard CoA** - Template CoA standar Indonesia  

---

## 🚀 **CARA TESTING**

### **1. Setup Database (Manual)**

Jalankan SQL berikut di Supabase SQL Editor:

```sql
-- Add Chart of Accounts columns
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS code VARCHAR(10);
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS normal_balance VARCHAR(10) DEFAULT 'DEBIT';
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_header BOOLEAN DEFAULT false;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add constraints
ALTER TABLE public.accounts ADD CONSTRAINT accounts_code_unique UNIQUE (code);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_normal_balance_check 
  CHECK (normal_balance IN ('DEBIT', 'CREDIT'));
ALTER TABLE public.accounts ADD CONSTRAINT accounts_parent_fk 
  FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_accounts_code ON public.accounts(code);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON public.accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_sort_order ON public.accounts(sort_order);
```

### **2. Testing UI Components**

1. **Akses Accounting Page**
   - Navigate ke `/accounting`
   - Sekarang menggunakan `EnhancedAccountManagement` component

2. **Testing Tree View**
   - Switch ke tab "Tree View"
   - Test expand/collapse functionality
   - Click pada accounts untuk selection
   - Lihat detail di panel kanan

3. **Testing Account Management**
   - Click "Tambah Account" 
   - Test validation (nama minimal 3 karakter, kode 4 digit)
   - Test auto-generated codes
   - Test parent-child relationship

### **3. Testing Import Standard CoA**

1. **Import via Demo Page**
   ```
   Navigate ke /coa-demo (belum ada route, perlu ditambah)
   Click "Import Standard CoA"
   ```

2. **Import via Accounting Page**
   ```
   Di accounting page, click "Import Standard CoA"
   ```

3. **Hasil yang diharapkan:**
   - 40+ accounts terimpor dengan struktur hierarkis
   - Account codes: 1000, 1100, 1110, dll
   - Parent-child relationships terbentuk
   - Tree view menampilkan struktur

---

## 🔍 **FITUR-FITUR YANG BISA DITEST**

### **✅ 1. Tree View Component**
**File:** `src/components/ChartOfAccountsTree.tsx`

**Features:**
- Hierarchical display dengan indentation
- Expand/collapse nodes
- Account icons (📁 untuk header, 💰 untuk detail)  
- Badge untuk tipe account dan properties
- Hover effects dan selection
- Action buttons (Edit, Delete, Add Sub-account)

**Test Cases:**
```typescript
// Test expand/collapse
- Click chevron untuk expand/collapse
- Verify parent-child relationship display
- Check proper indentation levels

// Test selection
- Click account untuk select
- Verify selected state (highlighted)
- Check detail panel updates

// Test actions (jika showActions=true)
- Hover untuk lihat action buttons
- Test Edit, Delete, Add Sub-account
```

### **✅ 2. Enhanced Account Management**
**File:** `src/components/EnhancedAccountManagement.tsx`

**Features:**
- Dual mode: Tree View + Table View
- Add account dialog dengan validation
- Edit account functionality
- Delete dengan safety checks
- Auto-generated account codes
- Parent account selection

**Test Cases:**
```typescript
// Test Add Account
- Form validation (nama, kode, tipe)
- Auto-generated codes berdasarkan parent
- Parent selection dropdown
- Normal balance auto-set berdasarkan tipe

// Test Edit Account
- Pre-filled form data
- Update account properties
- Maintain hierarchy consistency

// Test Delete Account
- Safety checks (no children, no balance)
- Confirmation dialog
- Cascade effects
```

### **✅ 3. Utility Functions**
**File:** `src/utils/chartOfAccountsUtils.ts`

**Functions Available:**
- `buildAccountTree()` - Build hierarchical structure
- `flattenAccountTree()` - Flatten untuk display
- `generateNextAccountCode()` - Auto-generate codes
- `validateAccountCode()` - Validate kode format
- `getChildAccounts()` - Get semua child accounts
- `canDeleteAccount()` - Check safety untuk delete

**Test Cases:**
```typescript
// Test buildAccountTree
const accounts = [...]; // Your account data
const tree = buildAccountTree(accounts);
// Verify hierarchy structure, parent-child relationships

// Test generateNextAccountCode
const codes = ['1000', '1100', '1110'];
const nextCode = generateNextAccountCode(codes, '1100'); // Should return '1120'

// Test validateAccountCode
validateAccountCode('1110'); // Should return true
validateAccountCode('ABCD'); // Should return false
```

### **✅ 4. Enhanced Hooks**
**File:** `src/hooks/useAccounts.ts`

**New Functions:**
- `importStandardCoA()` - Import template
- `moveAccount()` - Move account dalam hierarchy  
- `bulkUpdateAccountCodes()` - Update multiple codes
- `getAccountBalance()` - Get balance with/without children

**Test Cases:**
```typescript
// Test import
const { importStandardCoA } = useAccounts();
importStandardCoA.mutate(templateData);

// Test move account
moveAccount.mutate({ 
  accountId: 'acc-123', 
  newParentId: 'acc-456',
  newSortOrder: 100 
});
```

---

## 🎮 **DEMO PAGE FEATURES**

**File:** `src/pages/ChartOfAccountsDemoPage.tsx`

**Tabs Available:**
1. **Interactive Tree** - Full tree dengan selection dan details
2. **CoA Template** - View template yang akan diimport  
3. **Account Structure** - Current database structure

**Statistics Cards:**
- Total Accounts count
- Header vs Detail breakdown
- Payment accounts count
- Balance summary
- Accounts by type distribution

---

## 🐛 **POTENTIAL ISSUES & TROUBLESHOOTING**

### **1. Database Issues**
```sql
-- Check if columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'accounts' AND table_schema = 'public';

-- Check constraints
SELECT conname FROM pg_constraint 
WHERE conrelid = 'public.accounts'::regclass;
```

### **2. Import Issues**
```typescript
// Check import function
console.log(STANDARD_COA_TEMPLATE.length); // Should be 40+

// Check template structure  
STANDARD_COA_TEMPLATE.forEach(t => {
  console.log(`${t.code} - ${t.name} (Level ${t.level})`);
});
```

### **3. Tree Rendering Issues**
```typescript
// Debug tree building
const tree = buildAccountTree(accounts);
console.log('Tree structure:', tree);

// Check parent-child mapping
accounts.forEach(acc => {
  if (acc.parentId) {
    console.log(`${acc.name} -> parent: ${acc.parentId}`);
  }
});
```

### **4. Missing Features**
- Route ke `/coa-demo` belum ada (perlu ditambah manual)
- Database functions belum dibuat di Supabase
- RLS policies mungkin perlu disesuaikan

---

## 📋 **TESTING CHECKLIST**

### **Database Setup**
- [ ] Columns CoA sudah ditambahkan
- [ ] Constraints dan indexes dibuat
- [ ] Existing accounts data masih utuh

### **UI Components**  
- [ ] Tree view renders dengan benar
- [ ] Expand/collapse berfungsi
- [ ] Selection dan highlight berfungsi  
- [ ] Account details panel update
- [ ] Action buttons muncul saat hover

### **Account Management**
- [ ] Add account form validation
- [ ] Auto-generated codes
- [ ] Parent selection dropdown  
- [ ] Edit functionality
- [ ] Delete dengan safety checks

### **Import Functionality**
- [ ] Import button tersedia
- [ ] Template data valid
- [ ] Import berhasil ke database
- [ ] Hierarchy terbentuk dengan benar
- [ ] Tree view update setelah import

### **Data Integrity**
- [ ] Parent-child relationships konsisten
- [ ] Account codes unique
- [ ] Normal balance sesuai tipe
- [ ] Sort order berfungsi
- [ ] Balance calculations benar

---

## 🎯 **NEXT STEPS**

Setelah testing berhasil:

1. **Add Route untuk Demo Page**
   ```typescript
   // di router config
   { path: '/coa-demo', element: <ChartOfAccountsDemoPage /> }
   ```

2. **Production Deployment**
   - Test di production database
   - Backup data sebelum migration
   - Run migration scripts
   - Validate hasil import

3. **Advanced Features**
   - Drag & drop untuk reorder
   - Bulk operations
   - Export functionality  
   - Account mapping utilities
   - Integration dengan cash flow

**Happy Testing! 🚀**