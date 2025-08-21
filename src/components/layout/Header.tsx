"use client"

import { Link, useNavigate, useLocation } from "react-router-dom";
import { CircleUser, Menu, Package, LogOut, Home, ShoppingCart, List, Users, Box, Settings, Shield, BarChart3, HandCoins, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "../ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePermissions, PERMISSIONS } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useCompanySettings();
  const { hasPermission } = usePermissions();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  // Menu items for the top navigation
  const menuItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/pos", label: "POS", icon: ShoppingCart, permission: PERMISSIONS.TRANSACTIONS },
    { href: "/transactions", label: "Transaksi", icon: List, permission: PERMISSIONS.TRANSACTIONS },
    { href: "/products", label: "Produk", icon: Package, permission: PERMISSIONS.PRODUCTS },
    { href: "/materials", label: "Bahan", icon: Box, permission: PERMISSIONS.MATERIALS },
    { href: "/customers", label: "Pelanggan", icon: Users, permission: PERMISSIONS.CUSTOMERS },
    { href: "/retasi", label: "Retasi", icon: Package, permission: PERMISSIONS.DELIVERIES },
    { href: "/cash-flow", label: "Arus Kas", icon: TrendingUp, permission: PERMISSIONS.FINANCIAL },
    { href: "/receivables", label: "Piutang", icon: HandCoins, permission: PERMISSIONS.FINANCIAL },
    { href: "/stock-report", label: "Laporan", icon: BarChart3, permission: PERMISSIONS.REPORTS },
  ].filter(item => !item.permission || hasPermission(item.permission));

  const adminMenuItems = [
    { href: "/employees", label: "Karyawan", icon: Users, permission: PERMISSIONS.EMPLOYEES },
    { href: "/settings", label: "Pengaturan", icon: Settings, permission: PERMISSIONS.SETTINGS },
    { href: "/roles", label: "Roles", icon: Shield, permission: PERMISSIONS.ROLES },
  ].filter(item => hasPermission(item.permission));

  return (
    <header className="border-b bg-background">
      {/* Top Row - Logo, Menu, User */}
      <div className="flex h-16 items-center px-6">
        {/* Mobile Menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 md:hidden mr-4">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0">
            <Sidebar isCollapsed={false} setCollapsed={() => {}} />
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <div className="flex items-center gap-2 mr-8">
          <Package className="h-6 w-6 text-primary" />
          <span className="font-semibold">{settings?.name || 'Aquvit POS'}</span>
        </div>

        {/* Desktop Navigation Menu */}
        <nav className="hidden md:flex items-center space-x-6 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {/* Admin Menu Dropdown */}
          {adminMenuItems.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Admin
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {adminMenuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link to={item.href} className="flex items-center">
                        <Icon className="h-4 w-4 mr-2" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        {/* Right Side - Theme Toggle & User Menu */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="rounded-full">
                <CircleUser className="h-5 w-5" />
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user?.name || 'Akun Saya'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/account-settings">Pengaturan Akun</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings">Info Perusahaan</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}