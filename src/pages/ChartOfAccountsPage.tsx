"use client"

import React, { useState, useMemo } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useAccounts } from "@/hooks/useAccounts"
import { useBranch } from "@/contexts/BranchContext"
import { useEmployees } from "@/hooks/useEmployees"
import { STANDARD_COA_TEMPLATE } from "@/utils/chartOfAccountsUtils"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/useAuth"
import { isOwner, isAdminOrOwner } from "@/utils/roleUtils"
import { Account } from "@/types/account"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Upload,
  FolderOpen,
  FileText,
  Search,
  Eye,
  Loader2,
  RefreshCw,
  Package,
  AlertCircle,
  Wallet
} from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
// journalService removed - now using RPC for all journal operations
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ============================================================================
// TEMPLATE COA STANDAR - DARI chartOfAccountsUtils.ts
// Template ini digunakan untuk import COA standar ke cabang baru
// Diambil dari STANDARD_COA_TEMPLATE di chartOfAccountsUtils.ts
// ============================================================================

// Map category to type for UI compatibility
function mapCategoryToType(category: string): 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban' {
  switch (category) {
    case 'ASET': return 'Aset';
    case 'KEWAJIBAN': return 'Kewajiban';
    case 'MODAL': return 'Modal';
    case 'PENDAPATAN': return 'Pendapatan';
    case 'HPP':
    case 'BEBAN_OPERASIONAL':
    case 'BEBAN_NON_OPERASIONAL': return 'Beban';
    default: return 'Aset';
  }
}

// Convert STANDARD_COA_TEMPLATE to format used in this page
const STANDARD_COA_INDONESIA = STANDARD_COA_TEMPLATE.map(item => ({
  code: item.code,
  name: item.name,
  level: item.level,
  type: mapCategoryToType(item.category),
  isHeader: item.isHeader,
  parentCode: item.parentCode,
  // Mark cash/bank accounts as payment accounts (codes 1120-1199)
  isPaymentAccount: item.code.startsWith('11') && !item.isHeader && item.code !== '1100'
}))

// ============================================================================
// INTERFACES
// ============================================================================
interface CoaTemplateItem {
  code: string
  name: string
  level: number
  type: string
  isHeader: boolean
  parentCode?: string
  isPaymentAccount?: boolean
  id?: string
  balance?: number
  initialBalance?: number
  employeeId?: string
  employeeName?: string
}

interface TreeNode {
  account: CoaTemplateItem
  children: TreeNode[]
  isExpanded: boolean
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function buildTree(accounts: CoaTemplateItem[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // Create nodes
  accounts.forEach(account => {
    nodeMap.set(account.code, {
      account,
      children: [],
      isExpanded: account.level <= 2
    })
  })

  // Build hierarchy
  accounts.forEach(account => {
    const node = nodeMap.get(account.code)!
    if (account.parentCode) {
      const parent = nodeMap.get(account.parentCode)
      if (parent) {
        parent.children.push(node)
      }
    } else {
      roots.push(node)
    }
  })

  // Sort children by code
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.account.code.localeCompare(b.account.code))
    nodes.forEach(node => sortChildren(node.children))
  }
  sortChildren(roots)

  return roots
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// ============================================================================
// TREE NODE COMPONENT
// ============================================================================
interface JournalLineDetail {
  id: string
  journalId: string
  entryNumber: string
  entryDate: string
  description: string
  debitAmount: number
  creditAmount: number
  referenceType: string
  status: string
  isVoided: boolean
}

interface TreeNodeRowProps {
  node: TreeNode
  level: number
  onToggle: (code: string) => void
  onEdit: (account: TreeNode['account']) => void
  onDelete: (account: TreeNode['account']) => void
  onAddChild: (parentCode: string) => void
  onViewJournals: (account: TreeNode['account']) => void
  canEdit: boolean
  canDelete: boolean
  selectedCode: string | null
  onSelect: (code: string) => void
}

function TreeNodeRow({
  node,
  level,
  onToggle,
  onEdit,
  onDelete,
  onAddChild,
  onViewJournals,
  canEdit,
  canDelete,
  selectedCode,
  onSelect
}: TreeNodeRowProps) {
  const { account, children, isExpanded } = node
  const hasChildren = children.length > 0
  const isSelected = selectedCode === account.code
  const paddingLeft = level * 24

  return (
    <>
      <div
        className={cn(
          "flex items-center py-2 px-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 transition-colors",
          isSelected && "bg-primary/10 hover:bg-primary/15",
          account.isHeader && "font-semibold"
        )}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={() => onSelect(account.code)}
      >
        {/* Expand/Collapse Button */}
        <div className="w-6 flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(account.code) }}
              className="p-0.5 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
        </div>

        {/* Icon */}
        <div className="w-6 flex-shrink-0 mr-2">
          {account.isHeader ? (
            <FolderOpen className="h-4 w-4 text-amber-500" />
          ) : (
            <FileText className="h-4 w-4 text-blue-500" />
          )}
        </div>

        {/* Code */}
        <div className="w-24 flex-shrink-0 font-mono text-sm text-muted-foreground">
          {account.code}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0 truncate flex items-center gap-2">
          <span>{account.name}</span>
          {account.isPaymentAccount && account.employeeName && (
            <Badge variant="outline" className="text-xs font-normal shrink-0">
              {account.employeeName}
            </Badge>
          )}
        </div>

        {/* Type Badge */}
        <div className="w-24 flex-shrink-0 text-center">
          <span className="text-xs text-muted-foreground">{account.type}</span>
        </div>

        {/* Initial Balance */}
        <div className="w-32 flex-shrink-0 text-right font-mono text-sm text-muted-foreground">
          {account.initialBalance !== undefined ? formatCurrency(account.initialBalance) : '-'}
        </div>

        {/* Balance */}
        <div className="w-32 flex-shrink-0 text-right font-mono text-sm">
          {account.balance !== undefined ? formatCurrency(account.balance) : '-'}
        </div>

        {/* Actions */}
        <div className="w-28 flex-shrink-0 flex justify-end gap-1">
          {/* View Journals - always show for non-header accounts */}
          {!account.isHeader && account.id && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-blue-600 hover:text-blue-700"
              onClick={(e) => { e.stopPropagation(); onViewJournals(account) }}
              title="Lihat Jurnal"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          )}
          {canEdit && !account.isHeader && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onEdit(account) }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {account.isHeader && canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onAddChild(account.code) }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && !account.isHeader && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(account) }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Render children */}
      {isExpanded && children.map(child => (
        <TreeNodeRow
          key={child.account.code}
          node={child}
          level={level + 1}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onViewJournals={onViewJournals}
          canEdit={canEdit}
          canDelete={canDelete}
          selectedCode={selectedCode}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function ChartOfAccountsPage() {
  const { accounts, isLoading, addAccount, updateAccount, deleteAccount, updateInitialBalance, getOpeningBalance } = useAccounts()
  const { currentBranch } = useBranch()
  const { employees } = useEmployees()
  const { toast } = useToast()
  const { user } = useAuth()

  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set(['1000', '2000', '3000', '4000', '5000', '6000', '1100', '2100']))
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [parentCodeForNew, setParentCodeForNew] = useState<string | null>(null)
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)
  const [originalOpeningBalance, setOriginalOpeningBalance] = useState<number>(0) // From journal, for comparison

  // Journal view state
  const [isJournalDialogOpen, setIsJournalDialogOpen] = useState(false)
  const [selectedAccountForJournal, setSelectedAccountForJournal] = useState<CoaTemplateItem | null>(null)
  const [journalLines, setJournalLines] = useState<JournalLineDetail[]>([])
  const [isLoadingJournals, setIsLoadingJournals] = useState(false)

  // Sync Inventory state
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [inventoryData, setInventoryData] = useState<{
    productsValue: number;
    materialsValue: number;
    productsJournalValue: number;
    materialsJournalValue: number;
  } | null>(null)
  const [isLoadingInventory, setIsLoadingInventory] = useState(false)

  // State for All Opening Balance Sync
  const [isAllOpeningDialogOpen, setIsAllOpeningDialogOpen] = useState(false)
  const [isSyncingAllOpening, setIsSyncingAllOpening] = useState(false)
  const [openingBalanceData, setOpeningBalanceData] = useState<{
    accounts: { code: string; name: string; type: string; initialBalance: number }[];
    totalAsset: number;
    totalOther: number;
  } | null>(null)
  const [isLoadingOpeningBalance, setIsLoadingOpeningBalance] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'Aset' as 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban',
    isHeader: false,
    isPaymentAccount: false,
    initialBalance: 0,
    employeeId: '' as string, // Karyawan yang ditugaskan untuk akun kas
    parentId: '' as string
  })

  // Filter employees for cash account assignment (supir, driver, cashier, sales, helper)
  const cashAccountEmployees = useMemo(() => {
    if (!employees) return [];
    const allowedRoles = ['supir', 'driver', 'cashier', 'sales', 'helper'];
    return employees.filter(emp =>
      allowedRoles.includes(emp.role?.toLowerCase()) &&
      emp.status === 'Aktif'
    );
  }, [employees]);

  const userIsOwner = isOwner(user)
  const userIsAdminOrOwner = isAdminOrOwner(user)

  // Transform accounts to tree structure
  const treeData = useMemo(() => {
    if (!accounts || accounts.length === 0) {
      // Show template if no accounts
      return buildTree(STANDARD_COA_INDONESIA)
    }

    // Map existing accounts to template format
    const mappedAccounts: CoaTemplateItem[] = accounts.map(acc => ({
      code: acc.code || '',
      name: acc.name,
      level: acc.level || 1,
      type: acc.type,
      isHeader: acc.isHeader || false,
      parentCode: acc.parentId ? accounts.find(a => a.id === acc.parentId)?.code : undefined,
      isPaymentAccount: acc.isPaymentAccount,
      id: acc.id,
      balance: acc.balance,
      initialBalance: acc.initialBalance,
      employeeId: acc.employeeId,
      employeeName: acc.employeeName
    }))

    return buildTree(mappedAccounts)
  }, [accounts])

  // Apply expanded state to tree
  const treeWithExpandState = useMemo(() => {
    const applyExpandState = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => ({
        ...node,
        isExpanded: expandedCodes.has(node.account.code),
        children: applyExpandState(node.children)
      }))
    }
    return applyExpandState(treeData)
  }, [treeData, expandedCodes])

  // Filter tree by search
  const filteredTree = useMemo(() => {
    if (!searchTerm) return treeWithExpandState

    const searchLower = searchTerm.toLowerCase()

    const filterNode = (node: TreeNode): TreeNode | null => {
      const matches =
        node.account.code.toLowerCase().includes(searchLower) ||
        node.account.name.toLowerCase().includes(searchLower)

      const filteredChildren = node.children
        .map(filterNode)
        .filter((n): n is TreeNode => n !== null)

      if (matches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
          isExpanded: true // Expand all when searching
        }
      }

      return null
    }

    return treeWithExpandState
      .map(filterNode)
      .filter((n): n is TreeNode => n !== null)
  }, [treeWithExpandState, searchTerm])

  const handleToggle = (code: string) => {
    setExpandedCodes(prev => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  const handleExpandAll = () => {
    const allCodes = new Set<string>()
    const collectCodes = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.children.length > 0) {
          allCodes.add(node.account.code)
          collectCodes(node.children)
        }
      })
    }
    collectCodes(treeData)
    setExpandedCodes(allCodes)
  }

  const handleCollapseAll = () => {
    setExpandedCodes(new Set())
  }

  // ============================================================================
  // SYNC INVENTORY FUNCTIONS
  // ============================================================================
  const handleOpenSyncDialog = async () => {
    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Pilih cabang terlebih dahulu" })
      return
    }

    setIsSyncDialogOpen(true)
    setIsLoadingInventory(true)

    try {
      // Get products with cost_price
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name, cost_price, base_price')
        .eq('branch_id', currentBranch.id)

      if (productsError) throw productsError

      // Get stock from VIEW (source of truth)
      const { data: productStockData } = await supabase
        .from('v_product_current_stock')
        .select('product_id, current_stock')
        .eq('branch_id', currentBranch.id)
      const productStockMap = new Map<string, number>();
      (productStockData || []).forEach((s: any) => productStockMap.set(s.product_id, Number(s.current_stock) || 0));

      const productsValue = (products || []).reduce((sum, p) => {
        const costPrice = p.cost_price || p.base_price || 0
        const stock = productStockMap.get(p.id) || 0
        return sum + (stock * costPrice)
      }, 0)

      // Get materials with price
      const { data: materials, error: materialsError } = await supabase
        .from('materials')
        .select('id, name, price_per_unit')
        .eq('branch_id', currentBranch.id)

      if (materialsError) throw materialsError

      // Get material stock from VIEW (source of truth)
      const { data: materialStockData } = await supabase
        .from('v_material_current_stock')
        .select('material_id, current_stock')
        .eq('branch_id', currentBranch.id)
      const materialStockMap = new Map<string, number>();
      (materialStockData || []).forEach((s: any) => materialStockMap.set(s.material_id, Number(s.current_stock) || 0));

      const materialsValue = (materials || []).reduce((sum, m) => {
        const stock = materialStockMap.get(m.id) || 0
        return sum + (stock * (m.price_per_unit || 0))
      }, 0)

      // Get current journal values for inventory accounts
      // Persediaan Barang Dagang (1310)
      const { data: journalProducts } = await supabase
        .from('journal_entry_lines')
        .select(`
          debit_amount,
          credit_amount,
          journal_entries!inner (
            is_voided,
            branch_id
          )
        `)
        .eq('account_code', '1310')
        .eq('journal_entries.branch_id', currentBranch.id)
        .eq('journal_entries.is_voided', false)

      const productsJournalValue = (journalProducts || []).reduce((sum, line) => {
        return sum + (line.debit_amount || 0) - (line.credit_amount || 0)
      }, 0)

      // Persediaan Bahan Baku (1320)
      const { data: journalMaterials } = await supabase
        .from('journal_entry_lines')
        .select(`
          debit_amount,
          credit_amount,
          journal_entries!inner (
            is_voided,
            branch_id
          )
        `)
        .eq('account_code', '1320')
        .eq('journal_entries.branch_id', currentBranch.id)
        .eq('journal_entries.is_voided', false)

      const materialsJournalValue = (journalMaterials || []).reduce((sum, line) => {
        return sum + (line.debit_amount || 0) - (line.credit_amount || 0)
      }, 0)

      setInventoryData({
        productsValue,
        materialsValue,
        productsJournalValue,
        materialsJournalValue
      })
    } catch (error: any) {
      console.error('Error loading inventory data:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data persediaan: " + error.message
      })
      setIsSyncDialogOpen(false)
    } finally {
      setIsLoadingInventory(false)
    }
  }

  const handleSyncInventory = async () => {
    if (!currentBranch?.id || !inventoryData) return

    // Calculate the difference (what needs to be journaled)
    const productsNeedJournal = inventoryData.productsValue - inventoryData.productsJournalValue
    const materialsNeedJournal = inventoryData.materialsValue - inventoryData.materialsJournalValue

    if (productsNeedJournal <= 0 && materialsNeedJournal <= 0) {
      toast({
        title: "Tidak Ada Selisih",
        description: "Persediaan sudah sinkron dengan jurnal akuntansi"
      })
      setIsSyncDialogOpen(false)
      return
    }

    setIsSyncing(true)

    try {
      // Create inventory opening balance journal via RPC
      const { data: resultRaw, error: rpcError } = await supabase
        .rpc('create_inventory_opening_balance_journal_rpc', {
          p_branch_id: currentBranch.id,
          p_products_value: Math.max(0, productsNeedJournal),
          p_materials_value: Math.max(0, materialsNeedJournal),
          p_opening_date: new Date().toISOString().split('T')[0],
        })

      const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw
      if (rpcError || !result?.success) {
        throw new Error(rpcError?.message || result?.error_message || 'Unknown error')
      }

      toast({
        title: "Sinkronisasi Berhasil",
        description: `Jurnal saldo awal persediaan berhasil dibuat (ID: ${result.journal_id?.substring(0, 8)}...)`
      })
      setIsSyncDialogOpen(false)
      setInventoryData(null)
    } catch (error: any) {
      console.error('Error syncing inventory:', error)
      toast({
        variant: "destructive",
        title: "Sinkronisasi Gagal",
        description: error.message
      })
    } finally {
      setIsSyncing(false)
    }
  }

  // ============================================================================
  // SYNC ALL OPENING BALANCES FUNCTIONS
  // ============================================================================
  const handleOpenAllOpeningDialog = async () => {
    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Pilih cabang terlebih dahulu" })
      return
    }

    setIsAllOpeningDialogOpen(true)
    setIsLoadingOpeningBalance(true)

    try {
      // Get all accounts with initial_balance for this branch
      const { data: accountsWithBalance, error } = await supabase
        .from('accounts')
        .select('code, name, type, initial_balance')
        .eq('branch_id', currentBranch.id)
        .not('initial_balance', 'is', null)
        .neq('initial_balance', 0)
        .order('code')

      if (error) throw error

      const accounts = (accountsWithBalance || []).map(acc => ({
        code: acc.code || '',
        name: acc.name,
        type: acc.type,
        initialBalance: acc.initial_balance || 0
      }))

      const totalAsset = accounts
        .filter(acc => acc.type?.toLowerCase().includes('aset'))
        .reduce((sum, acc) => sum + acc.initialBalance, 0)

      const totalOther = accounts
        .filter(acc => !acc.type?.toLowerCase().includes('aset'))
        .reduce((sum, acc) => sum + acc.initialBalance, 0)

      setOpeningBalanceData({ accounts, totalAsset, totalOther })
    } catch (error: any) {
      console.error('Error loading opening balance data:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data saldo awal: " + error.message
      })
      setIsAllOpeningDialogOpen(false)
    } finally {
      setIsLoadingOpeningBalance(false)
    }
  }

  const handleSyncAllOpeningBalances = async () => {
    if (!currentBranch?.id || !openingBalanceData) return

    if (openingBalanceData.accounts.length === 0) {
      toast({
        title: "Tidak Ada Saldo Awal",
        description: "Tidak ada akun dengan saldo awal yang perlu dijurnal"
      })
      setIsAllOpeningDialogOpen(false)
      return
    }

    setIsSyncingAllOpening(true)

    try {
      // Create all opening balance journals via RPC
      const { data: resultRaw, error: rpcError } = await supabase
        .rpc('create_all_opening_balance_journal_rpc', {
          p_branch_id: currentBranch.id,
          p_opening_date: new Date().toISOString().split('T')[0],
        })

      const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw
      if (rpcError || !result?.success) {
        throw new Error(rpcError?.message || result?.error_message || 'Unknown error')
      }

      toast({
        title: "Sinkronisasi Berhasil",
        description: `Jurnal saldo awal berhasil dibuat untuk ${result.accounts_processed || 0} akun. Total Debit: Rp ${(result.total_debit || 0).toLocaleString('id-ID')}`
      })
      setIsAllOpeningDialogOpen(false)
      setOpeningBalanceData(null)
    } catch (error: any) {
      console.error('Error syncing opening balances:', error)
      toast({
        variant: "destructive",
        title: "Sinkronisasi Gagal",
        description: error.message
      })
    } finally {
      setIsSyncingAllOpening(false)
    }
  }

  // ============================================================================
  // SYNC ALL - Combined function to sync inventory + opening balances
  // ============================================================================
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [syncAllDialogOpen, setSyncAllDialogOpen] = useState(false)
  const [syncAllPreview, setSyncAllPreview] = useState<{
    inventory: { productsValue: number; materialsValue: number; productsNeedSync: number; materialsNeedSync: number } | null;
    openingBalances: { accounts: { code: string; name: string; type: string; initialBalance: number }[]; totalAsset: number; totalOther: number } | null;
  } | null>(null)

  const handleOpenSyncAllDialog = async () => {
    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Pilih cabang terlebih dahulu" })
      return
    }

    setSyncAllDialogOpen(true)
    setIsSyncingAll(true)

    try {
      // 1. Get inventory data (products + materials) - stock from VIEW
      const { data: products } = await supabase
        .from('products')
        .select('id, name, cost_price, base_price')
        .eq('branch_id', currentBranch.id)

      // Get stock from VIEW (source of truth)
      const { data: productStockData } = await supabase
        .from('v_product_current_stock')
        .select('product_id, current_stock')
        .eq('branch_id', currentBranch.id)
      const productStockMap = new Map<string, number>();
      (productStockData || []).forEach((s: any) => productStockMap.set(s.product_id, Number(s.current_stock) || 0));

      const productsValue = (products || []).reduce((sum, p) => {
        const costPrice = p.cost_price || p.base_price || 0
        const stock = productStockMap.get(p.id) || 0
        return sum + (stock * costPrice)
      }, 0)

      const { data: materials } = await supabase
        .from('materials')
        .select('id, name, price_per_unit')
        .eq('branch_id', currentBranch.id)

      // Get material stock from VIEW (source of truth)
      const { data: materialStockData } = await supabase
        .from('v_material_current_stock')
        .select('material_id, current_stock')
        .eq('branch_id', currentBranch.id)
      const materialStockMap = new Map<string, number>();
      (materialStockData || []).forEach((s: any) => materialStockMap.set(s.material_id, Number(s.current_stock) || 0));

      const materialsValue = (materials || []).reduce((sum, m) => {
        const stock = materialStockMap.get(m.id) || 0
        return sum + (stock * (m.price_per_unit || 0))
      }, 0)

      // Get current journal values
      const { data: journalProducts } = await supabase
        .from('journal_entry_lines')
        .select('debit_amount, credit_amount, journal_entries!inner(is_voided, branch_id)')
        .eq('account_code', '1310')
        .eq('journal_entries.branch_id', currentBranch.id)
        .eq('journal_entries.is_voided', false)

      const productsJournalValue = (journalProducts || []).reduce((sum, line) => {
        return sum + (line.debit_amount || 0) - (line.credit_amount || 0)
      }, 0)

      const { data: journalMaterials } = await supabase
        .from('journal_entry_lines')
        .select('debit_amount, credit_amount, journal_entries!inner(is_voided, branch_id)')
        .eq('account_code', '1320')
        .eq('journal_entries.branch_id', currentBranch.id)
        .eq('journal_entries.is_voided', false)

      const materialsJournalValue = (journalMaterials || []).reduce((sum, line) => {
        return sum + (line.debit_amount || 0) - (line.credit_amount || 0)
      }, 0)

      // 2. Get opening balance accounts (exclude inventory accounts 1310, 1320)
      const { data: accountsWithBalance } = await supabase
        .from('accounts')
        .select('code, name, type, initial_balance')
        .eq('branch_id', currentBranch.id)
        .not('initial_balance', 'is', null)
        .neq('initial_balance', 0)
        .not('code', 'in', '("1310","1320")') // Exclude inventory accounts
        .order('code')

      const openingAccounts = (accountsWithBalance || []).map(acc => ({
        code: acc.code || '',
        name: acc.name,
        type: acc.type,
        initialBalance: acc.initial_balance || 0
      }))

      const totalAsset = openingAccounts
        .filter(acc => acc.type?.toLowerCase().includes('aset'))
        .reduce((sum, acc) => sum + acc.initialBalance, 0)

      const totalOther = openingAccounts
        .filter(acc => !acc.type?.toLowerCase().includes('aset'))
        .reduce((sum, acc) => sum + acc.initialBalance, 0)

      setSyncAllPreview({
        inventory: {
          productsValue,
          materialsValue,
          productsNeedSync: Math.max(0, productsValue - productsJournalValue),
          materialsNeedSync: Math.max(0, materialsValue - materialsJournalValue)
        },
        openingBalances: {
          accounts: openingAccounts,
          totalAsset,
          totalOther
        }
      })
    } catch (error: any) {
      console.error('Error loading sync all preview:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data: " + error.message
      })
      setSyncAllDialogOpen(false)
    } finally {
      setIsSyncingAll(false)
    }
  }

  const handleExecuteSyncAll = async () => {
    if (!currentBranch?.id || !syncAllPreview) return

    setIsSyncingAll(true)
    const results: string[] = []
    let hasError = false

    try {
      // 1. Sync Inventory (if needed)
      const { productsNeedSync, materialsNeedSync } = syncAllPreview.inventory || { productsNeedSync: 0, materialsNeedSync: 0 }

      if (productsNeedSync > 0 || materialsNeedSync > 0) {
        const inventoryResult = await createInventoryOpeningBalanceJournal({
          productsInventoryValue: productsNeedSync,
          materialsInventoryValue: materialsNeedSync,
          branchId: currentBranch.id,
          openingDate: new Date()
        })

        if (inventoryResult.success) {
          results.push(`✓ Persediaan: Rp ${(productsNeedSync + materialsNeedSync).toLocaleString('id-ID')}`)
        } else {
          results.push(`✗ Persediaan: ${inventoryResult.error}`)
          hasError = true
        }
      } else {
        results.push('○ Persediaan: Sudah sinkron')
      }

      // 2. Sync Opening Balances (if needed)
      if (syncAllPreview.openingBalances && syncAllPreview.openingBalances.accounts.length > 0) {
        const openingResult = await createAllOpeningBalanceJournal({
          branchId: currentBranch.id,
          openingDate: new Date()
        })

        if (openingResult.success) {
          results.push(`✓ Saldo Awal: ${openingResult.summary?.accountsProcessed || 0} akun`)
        } else {
          results.push(`✗ Saldo Awal: ${openingResult.error}`)
          hasError = true
        }
      } else {
        results.push('○ Saldo Awal: Tidak ada yang perlu dijurnal')
      }

      toast({
        variant: hasError ? "destructive" : "default",
        title: hasError ? "Sinkronisasi Sebagian Gagal" : "Sinkronisasi Selesai",
        description: results.join('\n'),
        duration: 8000
      })

      if (!hasError) {
        setSyncAllDialogOpen(false)
        setSyncAllPreview(null)
      }
    } catch (error: any) {
      console.error('Error executing sync all:', error)
      toast({
        variant: "destructive",
        title: "Sinkronisasi Gagal",
        description: error.message
      })
    } finally {
      setIsSyncingAll(false)
    }
  }

  const handleImportClick = () => {
    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Pilih cabang terlebih dahulu" })
      return
    }
    setIsImportDialogOpen(true)
  }

  const handleImportStandardCoA = async (deleteExisting: boolean) => {
    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Pilih cabang terlebih dahulu" })
      return
    }

    setIsImporting(true)

    try {
      // Delete existing accounts if requested
      // Sort by level descending (delete children first, then parents)
      // Skip accounts that are still in use by other tables (foreign key constraints)
      if (deleteExisting && accounts && accounts.length > 0) {
        const sortedAccounts = [...accounts].sort((a, b) => (b.level || 1) - (a.level || 1))
        let skippedCount = 0
        for (const acc of sortedAccounts) {
          try {
            await deleteAccount.mutateAsync(acc.id)
          } catch (err: any) {
            // Skip accounts with foreign key constraints (still in use)
            if (err.message?.includes('foreign key') || err.message?.includes('violates')) {
              skippedCount++
              console.warn(`Skipped account ${acc.code} - still in use`)
            } else {
              console.warn(`Failed to delete account ${acc.code}:`, err)
            }
          }
        }
        if (skippedCount > 0) {
          toast({
            title: "Info",
            description: `${skippedCount} akun tidak dihapus karena masih digunakan (jurnal, aset, dll). Akun-akun tersebut akan di-update.`
          })
        }
      }

      // Import each account
      // First pass: create or update all accounts without parent
      const createdAccounts: Map<string, string> = new Map() // code -> id

      // Check existing accounts by code for this branch
      const existingAccountsByCode = new Map<string, typeof accounts[0]>()
      accounts?.forEach(acc => {
        if (acc.code) existingAccountsByCode.set(acc.code, acc)
      })

      for (const template of STANDARD_COA_INDONESIA) {
        const existingAccount = existingAccountsByCode.get(template.code)

        if (existingAccount) {
          // Update existing account (preserve balance and initial_balance)
          await updateAccount.mutateAsync({
            accountId: existingAccount.id,
            newData: {
              name: template.name,
              type: template.type as 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban',
              level: template.level,
              isHeader: template.isHeader,
              isPaymentAccount: template.isPaymentAccount || false,
              sortOrder: parseInt(template.code) || 0,
            }
          })
          createdAccounts.set(template.code, existingAccount.id)
        } else {
          // Create new account
          const accountData = {
            name: template.name,
            type: template.type as 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban',
            code: template.code,
            level: template.level,
            isHeader: template.isHeader,
            isPaymentAccount: template.isPaymentAccount || false,
            isActive: true,
            balance: 0,
            initialBalance: 0,
            sortOrder: parseInt(template.code) || 0,
            branchId: currentBranch.id
          }

          const created = await addAccount.mutateAsync(accountData)
          createdAccounts.set(template.code, created.id)
        }
      }

      // Second pass: update parent relationships
      for (const template of STANDARD_COA_INDONESIA) {
        if (template.parentCode) {
          const accountId = createdAccounts.get(template.code)
          const parentId = createdAccounts.get(template.parentCode)
          if (accountId && parentId) {
            await updateAccount.mutateAsync({
              accountId,
              newData: { parentId }
            })
          }
        }
      }

      setIsImportDialogOpen(false)
      toast({
        title: "Import Berhasil",
        description: `${STANDARD_COA_INDONESIA.length} akun berhasil diimport${deleteExisting ? ' (data lama dihapus)' : ''}`
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Import Gagal",
        description: error.message
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleAddChild = (parentCode: string) => {
    setParentCodeForNew(parentCode)

    // Find parent to determine type and level
    const parent = STANDARD_COA_INDONESIA.find(a => a.code === parentCode) ||
      accounts?.find(a => a.code === parentCode)

    if (parent) {
      // Generate next code based on parent code
      // For numeric codes like 1100, generate 1110, 1120, etc.
      const siblingCodes = (accounts || [])
        .filter(a => {
          if (!a.code) return false
          // Check if it's a direct child (same prefix, one level deeper)
          return a.code.startsWith(parentCode) && a.code.length === parentCode.length + 2
        })
        .map(a => a.code!)

      let nextNumber = 10
      if (siblingCodes.length > 0) {
        const maxCode = Math.max(...siblingCodes.map(c => parseInt(c.slice(-2))))
        nextNumber = maxCode + 10
      }

      const newCode = `${parentCode}${nextNumber.toString().padStart(2, '0')}`

      setFormData({
        code: newCode,
        name: '',
        type: parent.type as any,
        isHeader: false,
        isPaymentAccount: false,
        initialBalance: 0
      })
    }

    setIsAddDialogOpen(true)
  }

  const handleEdit = async (account: TreeNode['account']) => {
    if (!account.id) return

    const existingAccount = accounts?.find(a => a.id === account.id)
    if (!existingAccount) return

    setAccountToEdit(existingAccount)

    // Fetch opening balance from journal (Single Source of Truth)
    let openingBalance = 0
    try {
      console.log('[handleEdit] Fetching opening balance for account:', existingAccount.id)
      const result = await getOpeningBalance.mutateAsync(existingAccount.id)
      console.log('[handleEdit] Opening balance result:', result)
      openingBalance = result.openingBalance
    } catch (error: any) {
      console.error('[handleEdit] Error fetching opening balance:', error?.message || error)
      // Fallback: jika RPC error, coba ambil dari kolom accounts (deprecated tapi sebagai backup)
      openingBalance = existingAccount.initialBalance || 0
    }

    console.log('[handleEdit] Final opening balance:', openingBalance)

    // Store original opening balance for comparison during save
    setOriginalOpeningBalance(openingBalance)

    setFormData({
      code: existingAccount.code || '',
      name: existingAccount.name,
      type: existingAccount.type,
      isHeader: existingAccount.isHeader || false,
      isPaymentAccount: existingAccount.isPaymentAccount,
      initialBalance: openingBalance,
      employeeId: existingAccount.employeeId || '',
      parentId: existingAccount.parentId || ''
    })
    setIsEditDialogOpen(true)
  }

  const handleDelete = (account: TreeNode['account']) => {
    if (!account.id) return

    const existingAccount = accounts?.find(a => a.id === account.id)
    if (!existingAccount) return

    setAccountToDelete(existingAccount)
    setIsDeleteDialogOpen(true)
  }

  const handleViewJournals = async (account: TreeNode['account']) => {
    if (!account.id || !currentBranch?.id) return

    setSelectedAccountForJournal(account)
    setIsJournalDialogOpen(true)
    setIsLoadingJournals(true)
    setJournalLines([])

    try {
      // Fetch journal lines for this account
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          id,
          debit_amount,
          credit_amount,
          description,
          journal_entries (
            id,
            entry_number,
            entry_date,
            description,
            reference_type,
            status,
            is_voided,
            branch_id
          )
        `)
        .eq('account_id', account.id)
        .order('id', { ascending: false })

      if (error) throw error

      // Filter by branch and map to our interface
      const lines: JournalLineDetail[] = (data || [])
        .filter((line: any) => line.journal_entries?.branch_id === currentBranch.id)
        .map((line: any) => ({
          id: line.id,
          journalId: line.journal_entries?.id || '',
          entryNumber: line.journal_entries?.entry_number || '',
          entryDate: line.journal_entries?.entry_date || '',
          description: line.journal_entries?.description || line.description || '',
          debitAmount: Number(line.debit_amount) || 0,
          creditAmount: Number(line.credit_amount) || 0,
          referenceType: line.journal_entries?.reference_type || '',
          status: line.journal_entries?.status || '',
          isVoided: line.journal_entries?.is_voided || false
        }))

      setJournalLines(lines)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message })
    } finally {
      setIsLoadingJournals(false)
    }
  }

  const handleSubmitAdd = async () => {
    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Pilih cabang terlebih dahulu" })
      return
    }

    if (!formData.code || !formData.name) {
      toast({ variant: "destructive", title: "Error", description: "Kode dan nama akun wajib diisi" })
      return
    }

    try {
      // Find parent account ID
      let parentId: string | undefined
      if (parentCodeForNew) {
        const parent = accounts?.find(a => a.code === parentCodeForNew)
        parentId = parent?.id
      }

      // Calculate level based on code length (4 digits = level 1, 6 = level 2, etc)
      const level = parentCodeForNew ? Math.floor(formData.code.length / 2) : 1

      const newAccount = await addAccount.mutateAsync({
        name: formData.name,
        type: formData.type,
        code: formData.code,
        level,
        isHeader: formData.isHeader,
        isPaymentAccount: formData.isPaymentAccount,
        isActive: true,
        balance: 0, // Balance is calculated from journals
        initialBalance: formData.initialBalance,
        sortOrder: parseInt(formData.code) || 0,
        parentId,
        branchId: currentBranch.id
      })

      // If initial balance is set, create opening journal
      if (formData.initialBalance && formData.initialBalance !== 0 && newAccount?.id) {
        await updateInitialBalance.mutateAsync({
          accountId: newAccount.id,
          initialBalance: formData.initialBalance
        })
      }

      toast({ title: "Sukses", description: "Akun berhasil ditambahkan" })
      setIsAddDialogOpen(false)
      setParentCodeForNew(null)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: error.message })
    }
  }

  const handleSubmitEdit = async () => {
    if (!accountToEdit) return

    try {
      // Check if initial balance changed (compare with journal value, not accounts column)
      const newInitialBalance = formData.initialBalance || 0
      const initialBalanceChanged = originalOpeningBalance !== newInitialBalance

      // Update account basic data
      // IMPORTANT: Do NOT include parentId to prevent accidental parent change
      await updateAccount.mutateAsync({
        accountId: accountToEdit.id,
        newData: {
          name: formData.name,
          code: formData.code,
          type: formData.type,
          isHeader: formData.isHeader,
          isPaymentAccount: formData.isPaymentAccount,
          parentId: formData.parentId || null,
          // Only include employeeId for payment accounts (cash/bank)
          ...(formData.isPaymentAccount && { employeeId: formData.employeeId || undefined })
        }
      })

      // If initial balance changed, use updateInitialBalance which creates opening journal
      if (initialBalanceChanged) {
        await updateInitialBalance.mutateAsync({
          accountId: accountToEdit.id,
          initialBalance: newInitialBalance
        })
      }

      toast({ title: "Sukses", description: "Akun berhasil diupdate" })
      setIsEditDialogOpen(false)
      setAccountToEdit(null)
      setOriginalOpeningBalance(0)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: error.message })
    }
  }

  const handleConfirmDelete = async () => {
    if (!accountToDelete) return

    try {
      await deleteAccount.mutateAsync(accountToDelete.id)
      toast({ title: "Sukses", description: "Akun berhasil dihapus" })
      setIsDeleteDialogOpen(false)
      setAccountToDelete(null)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: error.message })
    }
  }

  return (
    <div className="w-full max-w-none p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bagan Akun (Chart of Accounts)</h1>
          <p className="text-muted-foreground text-sm">
            Kelola struktur akun keuangan sesuai standar akuntansi Indonesia
          </p>
        </div>

        {userIsAdminOrOwner && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleImportClick}
              disabled={isImporting}
              variant="outline"
            >
              <Upload className="h-4 w-4 mr-2" />
              {isImporting ? 'Mengimport...' : 'Import COA'}
            </Button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari kode atau nama akun..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExpandAll}>
                <ChevronDown className="h-4 w-4 mr-1" />
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={handleCollapseAll}>
                <ChevronRight className="h-4 w-4 mr-1" />
                Collapse All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tree View */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center text-sm font-medium text-muted-foreground">
            <div className="w-6 flex-shrink-0" /> {/* Expand button space */}
            <div className="w-6 flex-shrink-0 mr-2" /> {/* Icon space */}
            <div className="w-24 flex-shrink-0">Kode</div>
            <div className="flex-1">Nama Akun</div>
            <div className="w-24 flex-shrink-0 text-center">Tipe</div>
            <div className="w-32 flex-shrink-0 text-right">Saldo Awal</div>
            <div className="w-32 flex-shrink-0 text-right">Saldo</div>
            <div className="w-28 flex-shrink-0 text-right">Aksi</div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Memuat data...
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {searchTerm ? 'Tidak ada akun yang cocok' : 'Belum ada akun. Import COA Standar untuk memulai.'}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-300px)] overflow-auto">
              {filteredTree.map(node => (
                <TreeNodeRow
                  key={node.account.code}
                  node={node}
                  level={0}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onAddChild={handleAddChild}
                  onViewJournals={handleViewJournals}
                  canEdit={userIsAdminOrOwner}
                  canDelete={userIsOwner}
                  selectedCode={selectedCode}
                  onSelect={setSelectedCode}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-amber-500" />
          <span>= Akun Header (Induk)</span>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-500" />
          <span>= Akun Detail (Dapat digunakan transaksi)</span>
        </div>
      </div>

      {/* Add Account Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Tambah Akun Baru</DialogTitle>
            <DialogDescription>
              {parentCodeForNew
                ? `Tambah sub-akun untuk ${parentCodeForNew}`
                : 'Buat akun baru dalam Chart of Accounts'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kode Akun</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="1.1.1.01"
                  noFormat
                />
              </div>
              <div className="space-y-2">
                <Label>Tipe Akun</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aset">Aset</SelectItem>
                    <SelectItem value="Kewajiban">Liabilitas</SelectItem>
                    <SelectItem value="Modal">Ekuitas</SelectItem>
                    <SelectItem value="Pendapatan">Pendapatan</SelectItem>
                    <SelectItem value="Beban">Beban</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nama Akun</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nama akun"
                noFormat
              />
            </div>

            <div className="space-y-2">
              <Label>Saldo Awal (Rp)</Label>
              <Input
                type="number"
                value={formData.initialBalance}
                onChange={(e) => setFormData({ ...formData, initialBalance: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isPaymentAccount"
                  checked={formData.isPaymentAccount}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPaymentAccount: !!checked })}
                />
                <Label htmlFor="isPaymentAccount" className="text-sm">Akun Pembayaran (Kas/Bank)</Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmitAdd} disabled={addAccount.isPending}>
              {addAccount.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Akun</DialogTitle>
            <DialogDescription>
              Ubah informasi akun {accountToEdit?.code}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kode Akun</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  noFormat
                />
              </div>
              <div className="space-y-2">
                <Label>Tipe Akun</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aset">Aset</SelectItem>
                    <SelectItem value="Kewajiban">Liabilitas</SelectItem>
                    <SelectItem value="Modal">Ekuitas</SelectItem>
                    <SelectItem value="Pendapatan">Pendapatan</SelectItem>
                    <SelectItem value="Beban">Beban</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nama Akun</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                noFormat
              />
            </div>

            <div className="space-y-2">
              <Label>Induk Akun (Parent)</Label>
              <Select
                value={formData.parentId || "none"}
                onValueChange={(v) => setFormData({ ...formData, parentId: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Pilih parent (opsional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tidak ada parent (Root)</SelectItem>
                  {accounts?.filter(a => a.isHeader && a.id !== accountToEdit?.id)
                    .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                    .map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Saldo Awal (Rp)</Label>
              <Input
                type="number"
                value={formData.initialBalance}
                onChange={(e) => setFormData({ ...formData, initialBalance: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="editIsPaymentAccount"
                  checked={formData.isPaymentAccount}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPaymentAccount: !!checked, employeeId: checked ? formData.employeeId : '' })}
                />
                <Label htmlFor="editIsPaymentAccount" className="text-sm">Akun Pembayaran (Kas/Bank)</Label>
              </div>
            </div>

            {/* Employee Assignment - only for payment accounts */}
            {formData.isPaymentAccount && (
              <div className="space-y-2">
                <Label>Ditugaskan ke Karyawan</Label>
                <Select
                  value={formData.employeeId || "none"}
                  onValueChange={(v) => setFormData({ ...formData, employeeId: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih karyawan (opsional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak ditugaskan</SelectItem>
                    {cashAccountEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Kas yang ditugaskan ke karyawan akan otomatis digunakan saat karyawan tersebut menerima pembayaran
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmitEdit} disabled={updateAccount.isPending}>
              {updateAccount.isPending ? 'Menyimpan...' : 'Update'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Akun</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus akun "{accountToDelete?.name}"?
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import COA Dialog */}
      <AlertDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import COA Standar</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {accounts && accounts.length > 0 ? (
                  <>
                    <p>Sudah ada {accounts.length} akun di database. Pilih opsi import:</p>
                    <ul className="mt-2 ml-4 list-disc text-sm">
                      <li><strong>Hapus & Import Baru</strong>: Hapus semua akun lama, import COA standar baru</li>
                      <li><strong>Tambah Saja</strong>: Pertahankan akun lama, tambah akun baru (mungkin duplikat)</li>
                    </ul>
                  </>
                ) : (
                  <p>Import {STANDARD_COA_INDONESIA.length} akun standar ke database?</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={isImporting}>Batal</AlertDialogCancel>
            {accounts && accounts.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => handleImportStandardCoA(true)}
                disabled={isImporting}
              >
                {isImporting ? 'Mengimport...' : 'Hapus & Import Baru'}
              </Button>
            )}
            <Button
              onClick={() => handleImportStandardCoA(false)}
              disabled={isImporting}
            >
              {isImporting ? 'Mengimport...' : (accounts && accounts.length > 0 ? 'Tambah Saja' : 'Import')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Journal Lines Dialog */}
      <Dialog open={isJournalDialogOpen} onOpenChange={setIsJournalDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Detail Jurnal: {selectedAccountForJournal?.code} - {selectedAccountForJournal?.name}
            </DialogTitle>
            <DialogDescription>
              Menampilkan semua transaksi jurnal untuk akun ini
            </DialogDescription>
          </DialogHeader>

          {isLoadingJournals ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : journalLines.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Tidak ada transaksi jurnal untuk akun ini
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Debit</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(journalLines.filter(l => !l.isVoided && l.status === 'posted').reduce((sum, l) => sum + l.debitAmount, 0))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Credit</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(journalLines.filter(l => !l.isVoided && l.status === 'posted').reduce((sum, l) => sum + l.creditAmount, 0))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Saldo (Debit - Credit)</p>
                  <p className={cn(
                    "text-lg font-bold",
                    journalLines.filter(l => !l.isVoided && l.status === 'posted').reduce((sum, l) => sum + l.debitAmount - l.creditAmount, 0) >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  )}>
                    {formatCurrency(journalLines.filter(l => !l.isVoided && l.status === 'posted').reduce((sum, l) => sum + l.debitAmount - l.creditAmount, 0))}
                  </p>
                </div>
              </div>

              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">No. Jurnal</TableHead>
                      <TableHead className="w-[100px]">Tanggal</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="w-[80px]">Tipe</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead className="w-[120px] text-right">Debit</TableHead>
                      <TableHead className="w-[120px] text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalLines.map((line) => (
                      <TableRow
                        key={line.id}
                        className={cn(
                          line.isVoided && "opacity-50 line-through",
                          line.status !== 'posted' && "bg-yellow-50 dark:bg-yellow-900/20"
                        )}
                      >
                        <TableCell className="font-mono text-xs">
                          {line.entryNumber}
                        </TableCell>
                        <TableCell className="text-xs">
                          {line.entryDate ? new Date(line.entryDate).toLocaleDateString('id-ID') : '-'}
                        </TableCell>
                        <TableCell className="text-sm max-w-[300px] truncate" title={line.description}>
                          {line.description}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {line.referenceType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {line.isVoided ? (
                            <Badge variant="destructive" className="text-xs">Void</Badge>
                          ) : line.status === 'posted' ? (
                            <Badge className="text-xs bg-green-600">Posted</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Draft</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">
                          {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">
                          {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="text-sm text-muted-foreground mt-2">
                Total {journalLines.length} transaksi ({journalLines.filter(l => l.isVoided).length} void, {journalLines.filter(l => l.status !== 'posted').length} draft)
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Sync Inventory Dialog */}
      <AlertDialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Sinkronisasi Saldo Awal Persediaan
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Fitur ini akan membuat jurnal saldo awal untuk menyeimbangkan nilai persediaan
                  di neraca dengan data aktual produk dan bahan baku.
                </p>

                {inventoryData && (
                  <div className="bg-muted rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Persediaan Barang Dagang</p>
                        <p className="font-mono font-semibold">{formatCurrency(inventoryData.productsValue)}</p>
                        <p className="text-xs text-muted-foreground">Jurnal: {formatCurrency(inventoryData.productsJournalValue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Persediaan Bahan Baku</p>
                        <p className="font-mono font-semibold">{formatCurrency(inventoryData.materialsValue)}</p>
                        <p className="text-xs text-muted-foreground">Jurnal: {formatCurrency(inventoryData.materialsJournalValue)}</p>
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Selisih yang akan dijurnal:</span>
                        <span className="font-mono font-bold text-lg">
                          {formatCurrency(
                            (inventoryData.productsValue - inventoryData.productsJournalValue) +
                            (inventoryData.materialsValue - inventoryData.materialsJournalValue)
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                      <p className="font-medium">Jurnal yang akan dibuat:</p>
                      <p>Dr. Persediaan Barang Dagang (1310)</p>
                      <p>Dr. Persediaan Bahan Baku (1320)</p>
                      <p className="ml-4">Cr. Laba Ditahan (3200)</p>
                    </div>
                  </div>
                )}

                {!inventoryData && !isLoadingInventory && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Gagal memuat data persediaan</span>
                  </div>
                )}

                {isLoadingInventory && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSyncing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSyncInventory}
              disabled={isSyncing || !inventoryData || (
                (inventoryData.productsValue - inventoryData.productsJournalValue) +
                (inventoryData.materialsValue - inventoryData.materialsJournalValue) <= 0
              )}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Membuat Jurnal...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Buat Jurnal Saldo Awal
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* NEW: Sync All Dialog (Combined Inventory + Opening Balances) */}
      <AlertDialog open={syncAllDialogOpen} onOpenChange={setSyncAllDialogOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sinkronisasi Saldo Awal
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Fitur ini akan membuat jurnal saldo awal untuk:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Persediaan Barang Dagang (produk jual)</li>
                  <li>Persediaan Bahan Baku (materials)</li>
                  <li>Akun lain dengan initial balance (Kas, Bank, dll)</li>
                </ul>

                {isSyncingAll && !syncAllPreview && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}

                {syncAllPreview && (
                  <div className="space-y-4">
                    {/* Inventory Section */}
                    <div className="bg-muted rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Persediaan
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Barang Dagang (1310)</p>
                          <p className="font-mono">Nilai: {formatCurrency(syncAllPreview.inventory?.productsValue || 0)}</p>
                          <p className={`font-mono ${(syncAllPreview.inventory?.productsNeedSync || 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            {(syncAllPreview.inventory?.productsNeedSync || 0) > 0
                              ? `Perlu jurnal: ${formatCurrency(syncAllPreview.inventory?.productsNeedSync || 0)}`
                              : '✓ Sudah sinkron'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Bahan Baku (1320)</p>
                          <p className="font-mono">Nilai: {formatCurrency(syncAllPreview.inventory?.materialsValue || 0)}</p>
                          <p className={`font-mono ${(syncAllPreview.inventory?.materialsNeedSync || 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            {(syncAllPreview.inventory?.materialsNeedSync || 0) > 0
                              ? `Perlu jurnal: ${formatCurrency(syncAllPreview.inventory?.materialsNeedSync || 0)}`
                              : '✓ Sudah sinkron'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Opening Balances Section */}
                    <div className="bg-muted rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        Saldo Awal Akun Lain
                      </h4>
                      {syncAllPreview.openingBalances && syncAllPreview.openingBalances.accounts.length > 0 ? (
                        <>
                          <div className="max-h-32 overflow-y-auto space-y-1 text-sm">
                            {syncAllPreview.openingBalances.accounts.map((acc, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span>{acc.code} - {acc.name}</span>
                                <span className="font-mono">{formatCurrency(acc.initialBalance)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t pt-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-medium">Total:</span>
                              <span className="font-mono font-bold">
                                {formatCurrency(syncAllPreview.openingBalances.totalAsset + syncAllPreview.openingBalances.totalOther)}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-green-600">✓ Tidak ada akun lain dengan saldo awal</p>
                      )}
                    </div>

                    {/* Summary */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm">
                      <p className="font-medium mb-2">Jurnal yang akan dibuat:</p>
                      <div className="space-y-1 text-xs">
                        <p>Dr. Persediaan Barang Dagang (1310)</p>
                        <p>Dr. Persediaan Bahan Baku (1320)</p>
                        <p>Dr. [Akun Aset lain dengan saldo awal]</p>
                        <p className="ml-4">Cr. Modal Disetor (3100) - untuk persediaan</p>
                        <p className="ml-4">Cr. Laba Ditahan (3200) - untuk akun lain</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSyncingAll}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecuteSyncAll}
              disabled={isSyncingAll || !syncAllPreview || (
                (syncAllPreview.inventory?.productsNeedSync || 0) === 0 &&
                (syncAllPreview.inventory?.materialsNeedSync || 0) === 0 &&
                (syncAllPreview.openingBalances?.accounts.length || 0) === 0
              )}
            >
              {isSyncingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sinkronkan Semua
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sync All Opening Balances Dialog (OLD - kept for reference) */}
      <AlertDialog open={isAllOpeningDialogOpen} onOpenChange={setIsAllOpeningDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sinkronisasi Saldo Awal Akun
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Fitur ini akan membuat jurnal saldo awal untuk akun-akun yang memiliki
                  initial balance (saldo awal) tapi belum ada jurnal penyeimbangnya.
                </p>

                {openingBalanceData && openingBalanceData.accounts.length > 0 && (
                  <div className="bg-muted rounded-lg p-4 space-y-3">
                    <div className="text-sm">
                      <p className="text-muted-foreground mb-2">Akun dengan saldo awal:</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {openingBalanceData.accounts.map((acc, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span>{acc.code} - {acc.name}</span>
                            <span className="font-mono">{formatCurrency(acc.initialBalance)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Total Saldo Awal Aset:</span>
                        <span className="font-mono font-bold">
                          {formatCurrency(openingBalanceData.totalAsset)}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                      <p className="font-medium">Jurnal yang akan dibuat:</p>
                      <p>Dr. [Akun Aset dengan saldo awal]</p>
                      <p className="ml-4">Cr. Laba Ditahan (3200) - sebagai penyeimbang</p>
                    </div>
                  </div>
                )}

                {openingBalanceData && openingBalanceData.accounts.length === 0 && (
                  <div className="flex items-center gap-2 text-green-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Tidak ada akun dengan saldo awal yang perlu dijurnal</span>
                  </div>
                )}

                {!openingBalanceData && !isLoadingOpeningBalance && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Gagal memuat data saldo awal</span>
                  </div>
                )}

                {isLoadingOpeningBalance && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSyncingAllOpening}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSyncAllOpeningBalances}
              disabled={isSyncingAllOpening || !openingBalanceData || openingBalanceData.accounts.length === 0}
            >
              {isSyncingAllOpening ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Membuat Jurnal...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Buat Jurnal Saldo Awal
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
