"use client"

import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Home,
  ShoppingCart,
  Package,
  Box,
  Settings,
  Users,
  FileText,
  List,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Landmark,
  HandCoins,
  ReceiptText,
  IdCard,
  Fingerprint,
  BookCheck,
  BarChart3,
  PackageOpen,
  Package2,
  Shield,
  TrendingUp,
  Factory,
  Truck,
  Calculator,
  PieChart,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePermissions, PERMISSIONS } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";

/*
 * Sidebar menu configuration.
 *
 * The application groups navigation links into a small number of top‑level
 * sections. Each section may be expanded or collapsed independently to make
 * long menus easier to scan. In addition, all report pages are grouped under
 * a dedicated "Laporan" section (Reports) rather than being mixed into other
 * management or finance sections. If you need to adjust or extend the menu
 * simply modify the data structure below – the rendering logic will adapt
 * automatically.
 */
const getMenuItems = (hasPermission: (permission: string) => boolean, userRole?: string) => [
  {
    title: "Utama",
    items: [
      { href: "/", label: "Dashboard", icon: Home },
      { href: "/pos", label: "Kasir (POS)", icon: ShoppingCart, permission: PERMISSIONS.TRANSACTIONS },
      { href: "/driver-pos", label: "POS Supir", icon: Truck, permission: PERMISSIONS.DELIVERIES, roles: ['supir', 'helper', 'admin', 'owner'] },
      { href: "/transactions", label: "Data Transaksi", icon: List, permission: PERMISSIONS.TRANSACTIONS },
      { href: "/delivery", label: "Pengantaran", icon: Truck, permission: PERMISSIONS.DELIVERIES },
      { href: "/retasi", label: "Retasi", icon: Package, permission: PERMISSIONS.DELIVERIES },
      { href: "/attendance", label: "Absensi", icon: Fingerprint, permission: PERMISSIONS.EMPLOYEES },
    ].filter(item => {
      // Check permission first
      if (item.permission && !hasPermission(item.permission)) return false;
      // Check role if specified
      if (item.roles && userRole && !item.roles.includes(userRole)) return false;
      return true;
    }),
  },
  {
    title: "Manajemen Data",
    items: [
      { href: "/products", label: "Produk", icon: Package, permission: PERMISSIONS.PRODUCTS },
      { href: "/materials", label: "Bahan & Stok", icon: Box, permission: PERMISSIONS.MATERIALS },
      { href: "/production", label: "Produksi", icon: Factory, permission: PERMISSIONS.PRODUCTS },
      { href: "/customers", label: "Pelanggan", icon: Users, permission: PERMISSIONS.CUSTOMERS },
      { href: "/employees", label: "Karyawan", icon: IdCard, permission: PERMISSIONS.EMPLOYEES },
      { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList, permission: PERMISSIONS.MATERIALS },
    ].filter(item => hasPermission(item.permission)),
  },
  {
    title: "Keuangan",
    items: [
      { href: "/accounts", label: "Akun Keuangan", icon: Landmark, permission: PERMISSIONS.FINANCIAL },
      { href: "/cash-flow", label: "Buku Besar", icon: TrendingUp, permission: PERMISSIONS.FINANCIAL },
      { href: "/receivables", label: "Piutang", icon: ReceiptText, permission: PERMISSIONS.FINANCIAL },
      { href: "/expenses", label: "Pengeluaran", icon: FileText, permission: PERMISSIONS.FINANCIAL },
      { href: "/advances", label: "Panjar Karyawan", icon: HandCoins, permission: PERMISSIONS.FINANCIAL },
      { href: "/commission-manage", label: "Pengaturan Komisi", icon: Calculator, permission: PERMISSIONS.FINANCIAL },
      { href: "/financial-reports", label: "Laporan Keuangan", icon: PieChart, permission: PERMISSIONS.FINANCIAL },
    ].filter(item => hasPermission(item.permission)),
  },
  {
    title: "Laporan",
    items: [
      { href: "/stock-report", label: "Laporan Stock", icon: BarChart3, permission: PERMISSIONS.REPORTS },
      { href: "/material-movements", label: "Pergerakan Penggunaan Bahan", icon: Package2, permission: PERMISSIONS.REPORTS },
      { href: "/transaction-items-report", label: "Laporan Item Keluar", icon: PackageOpen, permission: PERMISSIONS.REPORTS },
      { href: "/attendance/report", label: "Laporan Absensi", icon: BookCheck, permission: PERMISSIONS.REPORTS },
      { href: "/commission-report", label: "Laporan Komisi", icon: Calculator, permission: PERMISSIONS.REPORTS },
    ].filter(item => hasPermission(item.permission)),
  },
  {
    title: "Pengaturan",
    items: [
      { href: "/settings", label: "Info Perusahaan", icon: Settings, permission: PERMISSIONS.SETTINGS },
      { href: "/roles", label: "Manajemen Roles", icon: Shield, permission: PERMISSIONS.ROLES },
    ].filter(item => hasPermission(item.permission)),
  },
].filter(section => section.items.length > 0);

interface SidebarProps {
  /**
   * Whether the entire sidebar is collapsed into icon‑only mode. This prop is
   * controlled by the parent layout. When `true`, section headers and link
   * labels are hidden and only icons remain visible.
   */
  isCollapsed: boolean;
  /**
   * Callback to toggle the collapsed state. Handlers within this component
   * should call this to shrink or expand the sidebar.
   */
  setCollapsed: (isCollapsed: boolean) => void;
}

export function Sidebar({ isCollapsed, setCollapsed }: SidebarProps) {
  const location = useLocation();
  const { settings } = useCompanySettings();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  
  // Get filtered menu items based on user permissions and role
  const menuItems = getMenuItems(hasPermission, user?.role);
  
  // Track expanded/collapsed state for each top‑level menu section. When
  // `true` the section's links are visible, otherwise they are hidden. Use
  // section titles as keys since they are stable.
  const [openSections, setOpenSections] = useState(() => {
    const initialState: Record<string, boolean> = {};
    menuItems.forEach((section) => {
      initialState[section.title] = true; // sections are expanded by default
    });
    return initialState;
  });

  function toggleSection(title: string) {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  return (
    <div className="border-r bg-muted/40">
      <TooltipProvider delayDuration={0}>
        <div className="flex h-full max-h-screen flex-col">
          <div
            className={cn(
              "flex h-14 items-center border-b lg:h-[60px]",
              isCollapsed ? "justify-center" : "px-4 lg:px-6"
            )}
          >
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <Package className="h-6 w-6 text-primary" />
              <span className={cn(isCollapsed && "hidden")}>{settings?.name || 'Aquvit POS'}</span>
            </Link>
          </div>
          <nav className="flex-1 space-y-2 overflow-auto py-4 px-2">
            {menuItems.map((section) => (
              <div key={section.title} className="space-y-1">
                {/* Section header */}
                {!isCollapsed && (
                  <button
                    type="button"
                    className="mb-1 flex w-full items-center justify-between px-2 text-sm font-semibold tracking-tight text-muted-foreground hover:text-primary"
                    onClick={() => toggleSection(section.title)}
                  >
                    <span>{section.title}</span>
                    {openSections[section.title] ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                )}
                <div
                  className={cn(
                    isCollapsed && "flex flex-col items-center",
                    !openSections[section.title] && !isCollapsed && "hidden"
                  )}
                >
                  {section.items.map((item) =>
                    isCollapsed ? (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <Link
                            to={item.href}
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-primary",
                              location.pathname === item.href &&
                                "bg-primary text-primary-foreground"
                            )}
                          >
                            <item.icon className="h-5 w-5" />
                            <span className="sr-only">{item.label}</span>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary",
                          location.pathname === item.href &&
                            "bg-primary text-primary-foreground hover:text-primary-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    )
                  )}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-auto border-t p-2">
            <div className={cn("flex", isCollapsed && "justify-center")}>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setCollapsed(!isCollapsed)}
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                <span className="sr-only">Toggle Sidebar</span>
              </Button>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}