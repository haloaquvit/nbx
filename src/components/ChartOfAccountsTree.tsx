import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Folder, CreditCard, Plus, Edit2, Trash2 } from 'lucide-react';
import { Account, AccountTreeNode } from '@/types/account';
import { buildAccountTree, flattenAccountTree, canDeleteAccount } from '@/utils/chartOfAccountsUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ChartOfAccountsTreeProps {
  accounts: Account[];
  onAccountSelect?: (account: Account) => void;
  onAccountEdit?: (account: Account) => void;
  onAccountDelete?: (account: Account) => void;
  onAddSubAccount?: (parentAccount: Account) => void;
  selectedAccountId?: string;
  showActions?: boolean;
  readOnly?: boolean;
}

interface TreeNodeProps {
  node: AccountTreeNode;
  accounts: Account[];
  onToggle: (nodeId: string) => void;
  onAccountSelect?: (account: Account) => void;
  onAccountEdit?: (account: Account) => void;
  onAccountDelete?: (account: Account) => void;
  onAddSubAccount?: (parentAccount: Account) => void;
  selectedAccountId?: string;
  showActions?: boolean;
  readOnly?: boolean;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  accounts,
  onToggle,
  onAccountSelect,
  onAccountEdit,
  onAccountDelete,
  onAddSubAccount,
  selectedAccountId,
  showActions = false,
  readOnly = false
}) => {
  const { account, children, level } = node;
  const hasChildren = children.length > 0;
  const isSelected = account.id === selectedAccountId;
  const isExpanded = node.isExpanded;

  const handleToggle = () => {
    if (hasChildren) {
      onToggle(account.id);
    }
  };

  const handleAccountClick = () => {
    onAccountSelect?.(account);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAccountEdit?.(account);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAccountDelete?.(account);
  };

  const handleAddSub = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddSubAccount?.(account);
  };

  const { canDelete, reason } = canDeleteAccount(account, accounts);

  // Calculate indentation
  const indentStyle = { paddingLeft: `${(level - 1) * 24 + 8}px` };

  // Account type badge color
  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'ASET': return 'default';
      case 'KEWAJIBAN': return 'destructive';
      case 'MODAL': return 'secondary';
      case 'PENDAPATAN': return 'success';
      case 'BEBAN_OPERASIONAL': return 'warning';
      default: return 'outline';
    }
  };

  return (
    <div className="select-none">
      {/* Main account row */}
      <div
        className={`
          flex items-center py-2 px-1 rounded-md cursor-pointer group
          hover:bg-muted/50 transition-colors
          ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''}
        `}
        style={indentStyle}
        onClick={handleAccountClick}
      >
        {/* Toggle button */}
        <div className="w-6 h-6 flex items-center justify-center mr-2">
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                handleToggle();
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>

        {/* Account icon */}
        <div className="mr-3">
          {account.isHeader ? (
            hasChildren && isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 text-blue-500" />
            )
          ) : (
            <CreditCard className="h-4 w-4 text-green-500" />
          )}
        </div>

        {/* Account info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Account code */}
            {account.code && (
              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {account.code}
              </span>
            )}
            
            {/* Account name */}
            <span className={`text-sm ${account.isHeader ? 'font-semibold' : 'font-medium'} truncate`}>
              {account.name}
            </span>
            
            {/* Payment account indicator */}
            {account.isPaymentAccount && (
              <Badge variant="outline" className="text-xs">
                Payment
              </Badge>
            )}
            
            {/* Account type badge */}
            <Badge variant={getBadgeVariant(account.type)} className="text-xs">
              {account.type}
            </Badge>
          </div>
          
          {/* Balance (for non-header accounts) */}
          {!account.isHeader && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Balance: {new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
              }).format(account.balance)}
            </div>
          )}
        </div>

        {/* Actions */}
        {showActions && !readOnly && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Add sub-account */}
            {account.isHeader && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-primary/10"
                      onClick={handleAddSub}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Tambah Sub-Account</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Edit account */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-blue-50"
                    onClick={handleEdit}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edit Account</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Delete account */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-red-50 disabled:opacity-50"
                    onClick={handleDelete}
                    disabled={!canDelete}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{canDelete ? 'Hapus Account' : reason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Child nodes */}
      {hasChildren && isExpanded && (
        <div className="ml-6">
          {children.map(childNode => (
            <TreeNode
              key={childNode.account.id}
              node={childNode}
              accounts={accounts}
              onToggle={onToggle}
              onAccountSelect={onAccountSelect}
              onAccountEdit={onAccountEdit}
              onAccountDelete={onAccountDelete}
              onAddSubAccount={onAddSubAccount}
              selectedAccountId={selectedAccountId}
              showActions={showActions}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ChartOfAccountsTree: React.FC<ChartOfAccountsTreeProps> = ({
  accounts,
  onAccountSelect,
  onAccountEdit,
  onAccountDelete,
  onAddSubAccount,
  selectedAccountId,
  showActions = false,
  readOnly = false
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Build tree structure
  const tree = React.useMemo(() => {
    const builtTree = buildAccountTree(accounts);
    
    // Update isExpanded property
    const updateExpandedState = (nodes: AccountTreeNode[]): AccountTreeNode[] => {
      return nodes.map(node => ({
        ...node,
        isExpanded: expandedNodes.has(node.account.id),
        children: updateExpandedState(node.children)
      }));
    };
    
    return updateExpandedState(builtTree);
  }, [accounts, expandedNodes]);

  // Set initial expanded state only once
  React.useEffect(() => {
    if (accounts.length > 0 && expandedNodes.size === 0) {
      const initialExpanded = new Set<string>();
      const addExpandedNodes = (nodes: AccountTreeNode[]) => {
        nodes.forEach(node => {
          if (node.level <= 2) { // Auto-expand first 2 levels
            initialExpanded.add(node.account.id);
          }
          addExpandedNodes(node.children);
        });
      };
      const builtTree = buildAccountTree(accounts);
      addExpandedNodes(builtTree);
      setExpandedNodes(initialExpanded);
    }
  }, [accounts.length]); // Only depend on length, not the array itself

  const handleToggle = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  if (!accounts || accounts.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Belum ada Chart of Accounts</p>
        <p className="text-sm">Mulai dengan menambahkan account pertama</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between py-2 px-4 bg-muted/30 rounded-md">
        <div className="font-semibold text-sm">Chart of Accounts</div>
        <div className="text-xs text-muted-foreground">
          {accounts.length} accounts
        </div>
      </div>

      {/* Tree */}
      <div className="border rounded-md bg-background">
        {tree.map(node => (
          <TreeNode
            key={node.account.id}
            node={node}
            accounts={accounts}
            onToggle={handleToggle}
            onAccountSelect={onAccountSelect}
            onAccountEdit={onAccountEdit}
            onAccountDelete={onAccountDelete}
            onAddSubAccount={onAddSubAccount}
            selectedAccountId={selectedAccountId}
            showActions={showActions}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
};