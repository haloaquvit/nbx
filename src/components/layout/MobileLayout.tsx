import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ShoppingCart, Clock, User, LogOut, Menu, X, List, Truck, Package, Users, ArrowLeft, Home, Sun, Moon, Building2, Check, ChevronsUpDown, Factory, MapPin } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { id } from 'date-fns/locale/id'
import { useTheme } from 'next-themes'
import { useBranch } from '@/contexts/BranchContext'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGranularPermission } from '@/hooks/useGranularPermission'

const MobileLayout = () => {
  const { user, signOut } = useAuth()
  const { settings } = useCompanySettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const { currentBranch, availableBranches, canAccessAllBranches, switchBranch } = useBranch()
  const { hasGranularPermission } = useGranularPermission()

  // Ref for active menu item to scroll into view
  const activeMenuRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const autoCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-close sidebar after inactivity (for touch devices)
  const resetAutoCloseTimer = () => {
    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current)
    }
    if (isSidebarOpen) {
      autoCloseTimeoutRef.current = setTimeout(() => {
        setIsSidebarOpen(false)
      }, 5000) // Auto-close after 5 seconds of inactivity
    }
  }

  // Scroll to active menu when sidebar opens
  useEffect(() => {
    if (isSidebarOpen && activeMenuRef.current && navRef.current) {
      // Small delay to ensure sidebar animation is complete
      setTimeout(() => {
        activeMenuRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }, 150)
      // Start auto-close timer
      resetAutoCloseTimer()
    }

    return () => {
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current)
      }
    }
  }, [isSidebarOpen])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  // Check if user is owner
  const isOwner = user?.role?.toLowerCase() === 'owner'

  // Permission checks
  const canAccessProduction = hasGranularPermission('production_view') || hasGranularPermission('production_create')

  // Filter menu based on user role
  const allowedRoles = ['supir', 'helper', 'admin', 'owner']
  const canAccessDriverPOS = user?.role && allowedRoles.includes(user.role)

  const menuItems = [
    {
      title: 'Point of Sale',
      icon: ShoppingCart,
      path: '/pos',
      description: 'Buat transaksi penjualan',
      color: 'bg-blue-500 hover:bg-blue-600',
      textColor: 'text-white'
    },
    ...(canAccessDriverPOS ? [{
      title: 'POS Supir',
      icon: Truck,
      path: '/driver-pos',
      description: 'POS khusus Supir & Helper',
      color: 'bg-orange-500 hover:bg-orange-600',
      textColor: 'text-white'
    }] : []),
    {
      title: 'Data Transaksi',
      icon: List,
      path: '/transactions',
      description: 'Lihat riwayat transaksi & cetak',
      color: 'bg-purple-500 hover:bg-purple-600',
      textColor: 'text-white'
    },
    {
      title: 'Data Pelanggan',
      icon: Users,
      path: '/customers',
      description: 'Kelola data pelanggan',
      color: 'bg-cyan-500 hover:bg-cyan-600',
      textColor: 'text-white'
    },
    {
      title: 'Pelanggan Terdekat',
      icon: MapPin,
      path: '/customer-map',
      description: 'Lihat pelanggan di sekitar Anda',
      color: 'bg-rose-500 hover:bg-rose-600',
      textColor: 'text-white'
    },
    ...(canAccessProduction ? [{
      title: 'Input Produksi',
      icon: Factory,
      path: '/production',
      description: 'Catat hasil produksi',
      color: 'bg-amber-500 hover:bg-amber-600',
      textColor: 'text-white'
    }] : []),
    {
      title: 'Absensi',
      icon: Clock,
      path: '/attendance',
      description: 'Clock In / Clock Out',
      color: 'bg-green-500 hover:bg-green-600',
      textColor: 'text-white'
    }
  ]

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  const currentPath = location.pathname
  
  const getPageTitle = (path: string) => {
    if (path.startsWith('/transactions/')) {
      return 'Detail Transaksi'
    }
    if (path.startsWith('/customers/')) {
      return 'Detail Pelanggan'
    }
    
    switch (path) {
      case '/pos':
        return 'Point of Sale'
      case '/driver-pos':
        return 'POS Supir'
      case '/transactions':
        return 'Data Transaksi'
      case '/customers':
        return 'Data Pelanggan'
      case '/production':
        return 'Input Produksi'
      case '/attendance':
        return 'Absensi'
      default:
        return 'ERP System'
    }
  }
  
  const handleBack = () => {
    if (currentPath === '/') {
      // Already at home, can't go back further
      return
    }
    
    // Smart navigation based on current path
    if (currentPath.startsWith('/transactions/')) {
      // From transaction detail, go back to transactions list
      navigate('/transactions')
    } else if (currentPath.startsWith('/customers/')) {
      // From customer detail, go back to customers list
      navigate('/customers')
    } else {
      // From any other page, go back to home
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800 pb-20">
      {/* Mobile Header - Logo, Title, User Actions */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 dark:bg-gray-900/80 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left - Logo */}
          <div className="flex items-center space-x-2">
            {settings?.logo ? (
              <img src={settings.logo} alt="Company Logo" className="h-8 w-8 object-contain" />
            ) : (
              <Package className="h-8 w-8 text-primary" />
            )}
          </div>
          
          {/* Center - Title */}
          <div className="flex-1 text-center px-4">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {currentPath === '/' ? (settings?.name || 'ERP System') : getPageTitle(currentPath)}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isOwner && currentBranch ? (
                <span className="flex items-center justify-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {currentBranch.name}
                </span>
              ) : (
                format(new Date(), "eeee, d MMM yyyy", { locale: id })
              )}
            </p>
          </div>
          
          {/* Right - User Actions */}
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="h-10 w-10 rounded-full p-0">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="bg-primary text-white text-xs">
                  {user?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-10 w-10">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Sidebar Overlay - Auto close when clicking outside */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ display: 'flex', flexDirection: 'column' }}
        onMouseLeave={() => setIsSidebarOpen(false)}
        onTouchStart={resetAutoCloseTimer}
        onScroll={resetAutoCloseTimer}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="bg-primary text-white">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="font-medium text-gray-900 dark:text-white truncate">
                {user?.name || 'User'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {user?.role || 'Staff'}
              </p>
            </div>
          </div>
        </div>

        <nav ref={navRef} className="p-4 space-y-2 overflow-y-auto" style={{ flex: 1, minHeight: 0 }}>
          {/* Back/Home Button */}
          {currentPath !== '/' && (
            <Button
              variant="outline"
              className="w-full justify-start h-auto p-4 text-left overflow-hidden mb-4 border-gray-300 dark:border-gray-600 transition-all duration-150 active:scale-95 active:opacity-80"
              onClick={() => {
                handleBack()
                setIsSidebarOpen(false)
              }}
            >
              <div className="flex items-center space-x-3 w-full overflow-hidden">
                <div className="p-2 rounded-lg flex-shrink-0 bg-gray-100 dark:bg-gray-700">
                  <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="font-medium truncate text-gray-900 dark:text-white">Kembali</p>
                  <p className="text-sm truncate text-gray-500 dark:text-gray-400">
                    {currentPath.startsWith('/transactions/') ? 'Ke Daftar Transaksi' : 
                     currentPath.startsWith('/customers/') ? 'Ke Daftar Pelanggan' : 
                     'Ke Beranda'}
                  </p>
                </div>
              </div>
            </Button>
          )}
          
          {/* Home Button - Always visible */}
          <Button
            variant={currentPath === '/' ? "default" : "ghost"}
            className={cn(
              "w-full justify-start h-auto p-4 text-left overflow-hidden mb-4 transition-all duration-150 active:scale-95 active:opacity-80",
              currentPath === '/' && "bg-primary text-white"
            )}
            onClick={() => {
              navigate('/')
              setIsSidebarOpen(false)
            }}
          >
            <div className="flex items-center space-x-3 w-full overflow-hidden">
              <div className={cn(
                "p-2 rounded-lg flex-shrink-0",
                currentPath === '/' ? "bg-white/20" : "bg-green-500"
              )}>
                <Home className={cn(
                  "h-5 w-5",
                  currentPath === '/' ? "text-white" : "text-white"
                )} />
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="font-medium truncate">Beranda</p>
                <p className={cn(
                  "text-sm truncate",
                  currentPath === '/' ? "text-white/80" : "text-gray-500 dark:text-gray-400"
                )}>
                  Dashboard utama
                </p>
              </div>
            </div>
          </Button>

          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPath === item.path

            return (
              <Button
                key={item.path}
                ref={isActive ? activeMenuRef : undefined}
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start h-auto p-4 text-left overflow-hidden transition-all duration-150 active:scale-95 active:opacity-80",
                  isActive && "bg-primary text-white ring-2 ring-primary/30"
                )}
                onClick={() => {
                  navigate(item.path)
                  setIsSidebarOpen(false)
                }}
              >
                <div className="flex items-center space-x-3 w-full overflow-hidden">
                  <div className={cn(
                    "p-2 rounded-lg flex-shrink-0",
                    isActive ? "bg-white/20" : item.color
                  )}>
                    <Icon className={cn(
                      "h-5 w-5",
                      isActive ? "text-white" : item.textColor
                    )} />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="font-medium truncate">{item.title}</p>
                    <p className={cn(
                      "text-sm truncate",
                      isActive ? "text-white/80" : "text-gray-500 dark:text-gray-400"
                    )}>
                      {item.description}
                    </p>
                  </div>
                </div>
              </Button>
            )
          })}
        </nav>

        {/* Settings Section */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3 flex-shrink-0">
          {/* Branch Selector - Owner Only */}
          {isOwner && canAccessAllBranches && availableBranches.length > 1 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Building2 className="h-3 w-3" />
                Pindah Cabang
              </label>
              <Select
                value={currentBranch?.id || ''}
                onValueChange={(value) => switchBranch(value)}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="Pilih cabang...">
                    {currentBranch?.name || 'Pilih cabang...'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{branch.name}</span>
                        <span className="text-xs text-muted-foreground">{branch.code}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Theme Toggle */}
          <Button
            variant="outline"
            className="w-full justify-between h-10"
            onClick={toggleTheme}
          >
            <span className="flex items-center gap-2">
              {theme === 'dark' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              <span className="text-sm">
                {theme === 'dark' ? 'Mode Gelap' : 'Mode Terang'}
              </span>
            </span>
            <Badge variant="secondary" className="text-xs">
              {theme === 'dark' ? 'Aktif' : 'Aktif'}
            </Badge>
          </Button>

          {/* Logout Button */}
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            onClick={handleLogout}
          >
            <LogOut className="mr-3 h-5 w-5" />
            Keluar
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-h-screen">
        {/* Home/Dashboard View */}
        {currentPath === '/' && (
          <div className="p-4 space-y-6">
            {/* Welcome Card */}
            <Card className="bg-gradient-to-r from-blue-500 to-green-500 text-white border-0">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-16 w-16 border-2 border-white/20">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="bg-white/20 text-white text-lg">
                      {user?.name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-bold">Selamat Datang!</h2>
                    <p className="text-white/90">{user?.name || 'User'}</p>
                    <p className="text-sm text-white/70">
                      {format(new Date(), "eeee, d MMMM yyyy", { locale: id })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Pilih Aplikasi
              </h3>
              <div className="grid gap-4">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Card 
                      key={item.path}
                      className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                      onClick={() => navigate(item.path)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center space-x-4">
                          <div className={cn("p-4 rounded-xl", item.color)}>
                            <Icon className={cn("h-8 w-8", item.textColor)} />
                          </div>
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {item.title}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        {currentPath !== '/' && (
          <div className="p-4">
            <Outlet />
          </div>
        )}
      </div>

      {/* Mobile Footer Navigation - Minimal */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200 dark:bg-gray-900/95 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left - Menu Button */}
          <Button variant="ghost" size="lg" onClick={toggleSidebar} className="flex items-center space-x-2 h-12 px-6">
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="text-sm font-medium">{isSidebarOpen ? 'Tutup' : 'Menu'}</span>
          </Button>
          
          {/* Right - Back Button */}
          {currentPath !== '/' ? (
            <Button variant="ghost" size="lg" onClick={handleBack} className="flex items-center space-x-2 h-12 px-6">
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Kembali</span>
            </Button>
          ) : (
            <div></div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MobileLayout