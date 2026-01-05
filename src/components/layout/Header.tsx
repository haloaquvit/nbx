"use client"

import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { CircleUser, Menu, Package, LogOut, Home, ShoppingCart, List, Users, Box, Settings, Shield, BarChart3, HandCoins, TrendingUp, Truck, Factory, Store, Wrench, UserCheck, Archive, FlaskConical, PieChart } from "lucide-react";
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

import { BranchSelector } from "../BranchSelector";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePermissions, PERMISSIONS } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { formatOfficeTimeOnly, formatOfficeDate } from "@/utils/officeTime";
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
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  // Menu items for the top navigation with unique icons
  const menuItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/pos", label: "POS Kasir", icon: Store, permission: PERMISSIONS.TRANSACTIONS },
    { href: "/delivery", label: "Pengantaran", icon: Truck, permission: PERMISSIONS.DELIVERIES },
    { href: "/transactions", label: "Transaksi", icon: List, permission: PERMISSIONS.TRANSACTIONS },
    { href: "/products", label: "Produk", icon: Package, permission: PERMISSIONS.PRODUCTS },
    { href: "/materials", label: "Bahan Baku", icon: FlaskConical, permission: PERMISSIONS.MATERIALS },
    { href: "/customers", label: "Pelanggan", icon: Users, permission: PERMISSIONS.CUSTOMERS },
    { href: "/retasi", label: "Retasi", icon: Archive, permission: PERMISSIONS.DELIVERIES },
    { href: "/cash-flow", label: "Arus Kas", icon: TrendingUp, permission: PERMISSIONS.FINANCIAL },
    { href: "/receivables", label: "Piutang", icon: HandCoins, permission: PERMISSIONS.FINANCIAL },
    { href: "/financial-reports", label: "Laporan Keuangan", icon: PieChart, permission: PERMISSIONS.FINANCIAL },
    { href: "/production", label: "Produksi", icon: Factory, permission: PERMISSIONS.PRODUCTION },
    { href: "/stock-report", label: "Laporan", icon: BarChart3, permission: PERMISSIONS.REPORTS },
  ].filter(item => !item.permission || hasPermission(item.permission));

  const adminMenuItems = [
    { href: "/employees", label: "Karyawan", icon: UserCheck, permission: PERMISSIONS.EMPLOYEES },
    { href: "/settings", label: "Pengaturan", icon: Wrench, permission: PERMISSIONS.SETTINGS },
    { href: "/roles", label: "Roles", icon: Shield, permission: PERMISSIONS.ROLES },
  ].filter(item => hasPermission(item.permission));

  return (
    <header className="border-b bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl w-full relative overflow-hidden">
      {/* Glossy glass overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-sm"></div>

      {/* Elegant shine effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 animate-pulse"></div>

      {/* Decorative glass orbs */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-gradient-radial from-white/20 via-white/10 to-transparent rounded-full blur-2xl"></div>
        <div className="absolute -top-16 right-1/4 w-32 h-32 bg-gradient-radial from-blue-300/20 via-blue-400/10 to-transparent rounded-full blur-xl"></div>
        <div className="absolute -bottom-8 right-1/3 w-36 h-36 bg-gradient-radial from-purple-300/15 via-purple-400/8 to-transparent rounded-full blur-2xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-gradient-radial from-white/8 via-white/4 to-transparent rounded-full blur-3xl"></div>
      </div>

      {/* Subtle border highlight */}
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>

      {/* Top Row - Logo, Menu, User */}
      <div className="flex h-28 items-center px-8 w-full max-w-none relative z-10">
        {/* Mobile Menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 md:hidden mr-6 text-white hover:bg-white/25 h-14 w-14 btn-glossy hover:scale-105 transition-all duration-300 shadow-lg">
              <Menu className="h-7 w-7" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0">
            <Sidebar isCollapsed={false} setCollapsed={() => { }} />
          </SheetContent>
        </Sheet>

        {/* ERP Branding */}
        <div className="flex items-center mr-4 md:mr-6 flex-shrink-0">
          <div className="flex flex-col">
            <span className="font-bold text-xl md:text-2xl text-white">ERP</span>
          </div>
        </div>

        {/* Desktop Navigation Menu - Auto-responsive */}
        <nav className="hidden md:block flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-1 md:gap-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-1 px-1 md:px-2 lg:px-3 py-1 md:py-2 rounded-md lg:rounded-lg text-xs md:text-sm lg:text-base font-medium lg:font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0 btn-glossy",
                    isActive
                      ? "bg-white/30 text-white backdrop-blur-lg border border-white/50 scale-105 shadow-lg"
                      : "text-white/90 hover:text-white hover:bg-white/20 hover:backdrop-blur-lg hover:scale-105 hover:shadow-lg"
                  )}
                  style={{
                    minWidth: 'fit-content',
                    maxWidth: `${Math.max(80, 100 - menuItems.length * 2)}px`
                  }}
                >
                  <Icon className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5 flex-shrink-0" />
                  <span className="hidden md:inline truncate text-xs lg:text-sm">{item.label}</span>
                </Link>
              );
            })}

            {/* Admin Menu Dropdown - Auto-responsive */}
            {adminMenuItems.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="text-white/90 hover:text-white hover:bg-white/20 hover:backdrop-blur-lg hover:scale-105 px-1 md:px-2 lg:px-3 py-1 md:py-2 rounded-md lg:rounded-lg font-medium lg:font-semibold text-xs md:text-sm lg:text-base shadow-lg transition-all duration-300 flex-shrink-0 btn-glossy">
                    <Settings className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5 md:mr-1 lg:mr-2" />
                    <span className="hidden md:inline text-xs lg:text-sm">Admin</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {adminMenuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild className="dropdown-item-hover">
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
          </div>
        </nav>

        {/* Right Side - Responsive User Controls */}
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          {/* User Info - Show on larger screens */}
          <div className="hidden xl:flex flex-col items-end text-right px-3 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 btn-glossy">
            <span className="text-sm font-semibold text-white drop-shadow-sm">{user?.name || 'User'}</span>
            <span className="text-xs text-white/80 capitalize">{user?.role || 'Guest'} • <span className="text-green-300">Online</span></span>
          </div>

          {/* Live Clock - Show on largest screens (menggunakan timezone kantor) */}
          <div className="hidden 2xl:flex flex-col items-center px-3 py-2 rounded-lg bg-white/15 backdrop-blur-lg border border-white/30 btn-glossy shadow-lg">
            <span className="text-sm font-bold text-white drop-shadow-sm">
              {formatOfficeTimeOnly(currentTime, settings?.timezone || 'Asia/Jakarta')}
            </span>
            <span className="text-xs text-white/80">
              {formatOfficeDate(currentTime, settings?.timezone || 'Asia/Jakarta')}
            </span>
          </div>

          {/* Branch Selector */}
          <BranchSelector />

          <div className="scale-110">
            <ThemeToggle />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/30 hover:scale-110 transition-all duration-300 h-10 w-10 md:h-12 md:w-12 shadow-xl border border-white/30 relative btn-glossy backdrop-blur-lg">
                <CircleUser className="h-5 w-5 md:h-6 md:w-6" />
                {/* Online indicator */}
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user?.name || 'Akun Saya'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="dropdown-item-hover">
                <Link to="/account-settings">Pengaturan Akun</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="dropdown-item-hover">
                <Link to="/settings">Info Perusahaan</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive dropdown-item-hover">
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