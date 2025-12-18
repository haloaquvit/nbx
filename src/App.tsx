import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/layout/Layout";
import MobileLayout from "@/components/layout/MobileLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Suspense, lazy, useEffect } from "react";
import PageLoader from "@/components/PageLoader";
import { useChunkErrorHandler } from "@/hooks/useChunkErrorHandler";
import { useMobileDetection } from "@/hooks/useMobileDetection";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { updateFavicon } from "@/utils/faviconUtils";
import { useCacheManager, useBackgroundRefresh } from "@/hooks/useCacheManager";

// Lazy load all pages
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const PosPage = lazy(() => import("@/pages/PosPage"));
const TransactionListPage = lazy(() => import("@/pages/TransactionListPage"));
const TransactionDetailPage = lazy(() => import("@/pages/TransactionDetailPage"));
const ProductPage = lazy(() => import("@/pages/ProductPage"));
const ProductDetailPage = lazy(() => import("@/pages/ProductDetailPage"));
const MaterialPage = lazy(() => import("@/pages/MaterialPage"));
const ProductionPage = lazy(() => import("@/pages/ProductionPage"));
const MaterialDetailPage = lazy(() => import("@/pages/MaterialDetailPage"));
const CustomerPage = lazy(() => import("@/pages/CustomerPage"));
const CustomerDetailPage = lazy(() => import("@/pages/CustomerDetailPage"));
const EmployeePage = lazy(() => import("@/pages/EmployeePage"));
const PurchaseOrderPage = lazy(() => import("@/pages/PurchaseOrderPage"));
const AccountingPage = lazy(() => import("@/pages/AccountingPage"));
const AccountDetailPage = lazy(() => import("@/pages/AccountDetailPage"));
const ReceivablesPage = lazy(() => import("@/pages/ReceivablesPage"));
const ExpensePage = lazy(() => import("@/pages/ExpensePage"));
const EmployeeAdvancePage = lazy(() => import("@/pages/EmployeeAdvancePage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const AccountSettingsPage = lazy(() => import("@/pages/AccountSettingsPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const AttendancePage = lazy(() => import("@/pages/AttendancePage"));
const AttendanceReportPage = lazy(() => import("@/pages/AttendanceReportPage"));
const StockReportPage = lazy(() => import("@/pages/StockReportPage"));
const TransactionItemsReportPage = lazy(() => import("@/pages/TransactionItemsReportPage"));
const ProductAnalyticsDebugPage = lazy(() => import("@/pages/ProductAnalyticsDebugPage"));
const MaterialMovementReportPage = lazy(() => import("@/pages/MaterialMovementReportPage"));
const ServiceMaterialReportPage = lazy(() => import("@/pages/ServiceMaterialReportPage"));
const CashFlowPage = lazy(() => import("@/pages/CashFlowPage"));
const RolesPage = lazy(() => import("@/pages/RolesPage"));
const RetasiPage = lazy(() => import("@/pages/RetasiPage"));
const DeliveryPage = lazy(() => import("@/pages/DeliveryPage"));
const DriverPosPage = lazy(() => import("@/pages/DriverPosPage"));
const SupplierPage = lazy(() => import("@/pages/SupplierPage"));
const PayrollPage = lazy(() => import("@/pages/PayrollPage"));
const CommissionManagePage = lazy(() => import("@/pages/CommissionManagePage"));
const CommissionReportPage = lazy(() => import("@/pages/CommissionReportPage"));
const FinancialReportsPage = lazy(() => import("@/pages/FinancialReportsPage"));
const AccountsPayablePage = lazy(() => import("@/pages/AccountsPayablePage"));
const AssetsPage = lazy(() => import("@/pages/AssetsPage"));
const MaintenancePage = lazy(() => import("@/pages/MaintenancePage"));
const ZakatPage = lazy(() => import("@/pages/ZakatPage"));
const BranchManagementPage = lazy(() => import("@/pages/BranchManagementPage"));

function App() {
  // Handle chunk loading errors
  useChunkErrorHandler();
  
  // Mobile detection
  const { shouldUseMobileLayout } = useMobileDetection();
  
  // Company settings for favicon
  const { settings } = useCompanySettings();
  
  // Cache management and optimization
  const { prefetchCriticalData, getCacheStats } = useCacheManager();
  useBackgroundRefresh();
  
  // Update favicon when company logo changes
  useEffect(() => {
    if (settings?.logo) {
      updateFavicon(settings.logo);
    }
  }, [settings?.logo]);

  // Prefetch critical data on app load
  useEffect(() => {
    const timer = setTimeout(() => {
      prefetchCriticalData();
      
    }, 1000); // Delay to avoid blocking initial load

    return () => clearTimeout(timer);
  }, [prefetchCriticalData, getCacheStats]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>
        <BranchProvider>
          <BrowserRouter future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              
              {/* Mobile routes - POS, Attendance, Transactions, and Customers */}
              {shouldUseMobileLayout ? (
                <Route element={<ProtectedRoute><MobileLayout /></ProtectedRoute>}>
                  <Route path="/" element={<PosPage />} />
                  <Route path="/pos" element={<PosPage />} />
                  <Route path="/driver-pos" element={<DriverPosPage />} />
                  <Route path="/attendance" element={<AttendancePage />} />
                  <Route path="/transactions" element={<TransactionListPage />} />
                  <Route path="/transactions/:id" element={<TransactionDetailPage />} />
                  <Route path="/customers" element={<CustomerPage />} />
                  <Route path="/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              ) : (
                /* Desktop routes - all features */
                <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/pos" element={<PosPage />} />
                  <Route path="/transactions" element={<TransactionListPage />} />
                  <Route path="/transactions/:id" element={<TransactionDetailPage />} />
                  <Route path="/products" element={<ProductPage />} />
                  <Route path="/products/:id" element={<ProductDetailPage />} />
                  <Route path="/materials" element={<MaterialPage />} />
                  <Route path="/production" element={<ProductionPage />} />
                  <Route path="/materials/:materialId" element={<MaterialDetailPage />} />
                  <Route path="/customers" element={<CustomerPage />} />
                  <Route path="/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="/employees" element={<EmployeePage />} />
                  <Route path="/payroll" element={<PayrollPage />} />
                  <Route path="/suppliers" element={<SupplierPage />} />
                  <Route path="/purchase-orders" element={<PurchaseOrderPage />} />
                  <Route path="/accounts" element={<AccountingPage />} />
                  <Route path="/accounts/:id" element={<AccountDetailPage />} />
                  <Route path="/receivables" element={<ReceivablesPage />} />
                  <Route path="/accounts-payable" element={<AccountsPayablePage />} />
                  <Route path="/expenses" element={<ExpensePage />} />
                  <Route path="/advances" element={<EmployeeAdvancePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/account-settings" element={<AccountSettingsPage />} />
                  <Route path="/attendance" element={<AttendancePage />} />
                  <Route path="/attendance/report" element={<AttendanceReportPage />} />
                  <Route path="/stock-report" element={<StockReportPage />} />
                  <Route path="/transaction-items-report" element={<TransactionItemsReportPage />} />
                  <Route path="/debug/product-analytics" element={<ProductAnalyticsDebugPage />} />
                  <Route path="/material-movements" element={<MaterialMovementReportPage />} />
                  <Route path="/service-material-report" element={<ServiceMaterialReportPage />} />
                  <Route path="/cash-flow" element={<CashFlowPage />} />
                  <Route path="/roles" element={<RolesPage />} />
                  <Route path="/retasi" element={<RetasiPage />} />
                  <Route path="/delivery" element={<DeliveryPage />} />
                  <Route path="/driver-pos" element={<DriverPosPage />} />
                  <Route path="/commission-manage" element={<CommissionManagePage />} />
                  <Route path="/commission-report" element={<CommissionReportPage />} />
                  <Route path="/financial-reports" element={<FinancialReportsPage />} />
                  <Route path="/assets" element={<AssetsPage />} />
                  <Route path="/maintenance" element={<MaintenancePage />} />
                  <Route path="/zakat" element={<ZakatPage />} />
                  <Route path="/branches" element={<BranchManagementPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              )}
            </Routes>
          </Suspense>
        </BrowserRouter>
        </BranchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;