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
  Search
} from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================================
// TEMPLATE COA STANDAR - BERDASARKAN DATA DATABASE AQUVIT
// Template ini digunakan untuk import COA standar ke cabang baru
// ============================================================================
const STANDARD_COA_INDONESIA = [
  // ========== 1. ASET ==========
  { code: '1000', name: 'ASET', level: 1, type: 'Aset', isHeader: true },
  { code: '1100', name: 'Kas dan Setara Kas', level: 2, type: 'Aset', isHeader: true, parentCode: '1000' },
  { code: '1110', name: 'Bank BCA', level: 3, type: 'Aset', isHeader: false, parentCode: '1100', isPaymentAccount: true },
  { code: '1120', name: 'Kas Tunai', level: 3, type: 'Aset', isHeader: false, parentCode: '1100', isPaymentAccount: true },
  { code: '1200', name: 'Piutang', level: 2, type: 'Aset', isHeader: true, parentCode: '1000' },
  { code: '1210', name: 'Piutang Usaha', level: 3, type: 'Aset', isHeader: false, parentCode: '1200' },
  { code: '1220', name: 'Piutang Karyawan', level: 3, type: 'Aset', isHeader: false, parentCode: '1200' },
  { code: '1300', name: 'Persediaan', level: 2, type: 'Aset', isHeader: true, parentCode: '1000' },
  { code: '1310', name: 'Persediaan Barang Dagang', level: 3, type: 'Aset', isHeader: false, parentCode: '1300' },
  { code: '1320', name: 'Persediaan Bahan Baku', level: 3, type: 'Aset', isHeader: false, parentCode: '1300' },
  { code: '1400', name: 'Aset Tetap', level: 2, type: 'Aset', isHeader: true, parentCode: '1000' },
  { code: '1410', name: 'Kendaraan', level: 3, type: 'Aset', isHeader: false, parentCode: '1400' },
  { code: '1420', name: 'Peralatan', level: 3, type: 'Aset', isHeader: false, parentCode: '1400' },
  { code: '1430', name: 'Akumulasi Penyusutan', level: 3, type: 'Aset', isHeader: false, parentCode: '1400' },

  // ========== 2. KEWAJIBAN ==========
  { code: '2000', name: 'KEWAJIBAN', level: 1, type: 'Kewajiban', isHeader: true },
  { code: '2100', name: 'Kewajiban Jangka Pendek', level: 2, type: 'Kewajiban', isHeader: true, parentCode: '2000' },
  { code: '2110', name: 'Hutang Usaha', level: 3, type: 'Kewajiban', isHeader: false, parentCode: '2100' },
  { code: '2120', name: 'Hutang Gaji', level: 3, type: 'Kewajiban', isHeader: false, parentCode: '2100' },
  { code: '2130', name: 'Hutang Pajak', level: 3, type: 'Kewajiban', isHeader: false, parentCode: '2100' },
  { code: '2200', name: 'Kewajiban Jangka Panjang', level: 2, type: 'Kewajiban', isHeader: true, parentCode: '2000' },
  { code: '2210', name: 'Hutang Bank', level: 3, type: 'Kewajiban', isHeader: false, parentCode: '2200' },

  // ========== 3. MODAL ==========
  { code: '3000', name: 'MODAL', level: 1, type: 'Modal', isHeader: true },
  { code: '3100', name: 'Modal Disetor', level: 2, type: 'Modal', isHeader: false, parentCode: '3000' },
  { code: '3200', name: 'Laba Ditahan', level: 2, type: 'Modal', isHeader: false, parentCode: '3000' },
  { code: '3300', name: 'Laba Tahun Berjalan', level: 2, type: 'Modal', isHeader: false, parentCode: '3000' },

  // ========== 4. PENDAPATAN ==========
  { code: '4000', name: 'PENDAPATAN', level: 1, type: 'Pendapatan', isHeader: true },
  { code: '4100', name: 'Pendapatan Usaha', level: 2, type: 'Pendapatan', isHeader: true, parentCode: '4000' },
  { code: '4110', name: 'Penjualan Produk', level: 3, type: 'Pendapatan', isHeader: false, parentCode: '4100' },
  { code: '4120', name: 'Penjualan Jasa', level: 3, type: 'Pendapatan', isHeader: false, parentCode: '4100' },
  { code: '4200', name: 'Pendapatan Lain-lain', level: 2, type: 'Pendapatan', isHeader: true, parentCode: '4000' },
  { code: '4210', name: 'Pendapatan Bunga', level: 3, type: 'Pendapatan', isHeader: false, parentCode: '4200' },
  { code: '4220', name: 'Pendapatan Lainnya', level: 3, type: 'Pendapatan', isHeader: false, parentCode: '4200' },

  // ========== 5. HPP ==========
  { code: '5000', name: 'HARGA POKOK PENJUALAN', level: 1, type: 'Beban', isHeader: true },
  { code: '5100', name: 'Harga Pokok Produk', level: 2, type: 'Beban', isHeader: false, parentCode: '5000' },
  { code: '5200', name: 'Biaya Bahan Baku', level: 2, type: 'Beban', isHeader: false, parentCode: '5000' },

  // ========== 6. BEBAN ==========
  { code: '6000', name: 'BEBAN OPERASIONAL', level: 1, type: 'Beban', isHeader: true },
  { code: '6100', name: 'Beban Gaji dan Upah', level: 2, type: 'Beban', isHeader: false, parentCode: '6000' },
  { code: '6200', name: 'Beban Transportasi', level: 2, type: 'Beban', isHeader: false, parentCode: '6000' },
  { code: '6300', name: 'Beban Listrik dan Air', level: 2, type: 'Beban', isHeader: false, parentCode: '6000' },
  { code: '6400', name: 'Beban Sewa', level: 2, type: 'Beban', isHeader: false, parentCode: '6000' },
  { code: '6500', name: 'Beban Penyusutan', level: 2, type: 'Beban', isHeader: false, parentCode: '6000' },
  { code: '6600', name: 'Beban Administrasi', level: 2, type: 'Beban', isHeader: false, parentCode: '6000' },
  { code: '6700', name: 'Beban Lain-lain', level: 2, type: 'Beban', isHeader: false, parentCode: '6000' },
]

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
interface TreeNodeRowProps {
  node: TreeNode
  level: number
  onToggle: (code: string) => void
  onEdit: (account: TreeNode['account']) => void
  onDelete: (account: TreeNode['account']) => void
  onAddChild: (parentCode: string) => void
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
        <div className="flex-1 min-w-0 truncate">
          {account.name}
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
        <div className="w-24 flex-shrink-0 flex justify-end gap-1">
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
  const { accounts, isLoading, addAccount, updateAccount, deleteAccount } = useAccounts()
  const { currentBranch } = useBranch()
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

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'Aset' as 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban',
    isHeader: false,
    isPaymentAccount: false,
    initialBalance: 0
  })

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
      initialBalance: acc.initialBalance
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
      if (deleteExisting && accounts && accounts.length > 0) {
        const sortedAccounts = [...accounts].sort((a, b) => (b.level || 1) - (a.level || 1))
        for (const acc of sortedAccounts) {
          try {
            await deleteAccount.mutateAsync(acc.id)
          } catch (err) {
            console.warn(`Failed to delete account ${acc.code}:`, err)
          }
        }
      }

      // Import each account
      // First pass: create all accounts without parent
      const createdAccounts: Map<string, string> = new Map() // code -> id

      for (const template of STANDARD_COA_INDONESIA) {
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

  const handleEdit = (account: TreeNode['account']) => {
    if (!account.id) return

    const existingAccount = accounts?.find(a => a.id === account.id)
    if (!existingAccount) return

    setAccountToEdit(existingAccount)
    setFormData({
      code: existingAccount.code || '',
      name: existingAccount.name,
      type: existingAccount.type,
      isHeader: existingAccount.isHeader || false,
      isPaymentAccount: existingAccount.isPaymentAccount,
      initialBalance: existingAccount.initialBalance || 0
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

      await addAccount.mutateAsync({
        name: formData.name,
        type: formData.type,
        code: formData.code,
        level,
        isHeader: formData.isHeader,
        isPaymentAccount: formData.isPaymentAccount,
        isActive: true,
        balance: formData.initialBalance,
        initialBalance: formData.initialBalance,
        sortOrder: parseInt(formData.code) || 0,
        parentId,
        branchId: currentBranch.id
      })

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
      await updateAccount.mutateAsync({
        accountId: accountToEdit.id,
        newData: {
          name: formData.name,
          code: formData.code,
          type: formData.type,
          isHeader: formData.isHeader,
          isPaymentAccount: formData.isPaymentAccount,
          initialBalance: formData.initialBalance
        }
      })

      toast({ title: "Sukses", description: "Akun berhasil diupdate" })
      setIsEditDialogOpen(false)
      setAccountToEdit(null)
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
          <Button
            onClick={handleImportClick}
            disabled={isImporting}
            variant={accounts && accounts.length > 0 ? "outline" : "default"}
          >
            <Upload className="h-4 w-4 mr-2" />
            {isImporting ? 'Mengimport...' : 'Import COA Standar'}
          </Button>
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
            <div className="w-24 flex-shrink-0 text-right">Aksi</div>
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
                  id="editIsPaymentAccount"
                  checked={formData.isPaymentAccount}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPaymentAccount: !!checked })}
                />
                <Label htmlFor="editIsPaymentAccount" className="text-sm">Akun Pembayaran (Kas/Bank)</Label>
              </div>
            </div>
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
    </div>
  )
}
