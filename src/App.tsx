import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/layout/Layout";
import MobileLayout from "@/components/layout/MobileLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Suspense, lazy } from "react";
import PageLoader from "@/components/PageLoader";
import { useChunkErrorHandler } from "@/hooks/useChunkErrorHandler";
import { useMobileDetection } from "@/hooks/useMobileDetection";

// Lazy load all pages
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const PosPage = lazy(() => import("@/pages/PosPage"));
const TransactionListPage = lazy(() => import("@/pages/TransactionListPage"));
const TransactionDetailPage = lazy(() => import("@/pages/TransactionDetailPage"));
const QuotationListPage = lazy(() => import("@/pages/QuotationListPage"));
const NewQuotationPage = lazy(() => import("@/pages/NewQuotationPage"));
const QuotationDetailPage = lazy(() => import("@/pages/QuotationDetailPage"));
const ProductPage = lazy(() => import("@/pages/ProductPage"));
const MaterialPage = lazy(() => import("@/pages/MaterialPage"));
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
const RolePermissionPage = lazy(() => import("@/pages/RolePermissionPage"));
const ProductAnalyticsDebugPage = lazy(() => import("@/pages/ProductAnalyticsDebugPage"));
const MaterialMovementReportPage = lazy(() => import("@/pages/MaterialMovementReportPage"));
const ServiceMaterialReportPage = lazy(() => import("@/pages/ServiceMaterialReportPage"));
const CashFlowPage = lazy(() => import("@/pages/CashFlowPage"));

function App() {
  // Handle chunk loading errors
  useChunkErrorHandler();
  
  // Mobile detection
  const { shouldUseMobileLayout } = useMobileDetection();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true }}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              
              {/* Mobile routes - POS, Attendance, and Transactions */}
              {shouldUseMobileLayout ? (
                <Route element={<ProtectedRoute><MobileLayout /></ProtectedRoute>}>
                  <Route path="/" element={<PosPage />} />
                  <Route path="/pos" element={<PosPage />} />
                  <Route path="/attendance" element={<AttendancePage />} />
                  <Route path="/transactions" element={<TransactionListPage />} />
                  <Route path="/transactions/:id" element={<TransactionDetailPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              ) : (
                /* Desktop routes - all features */
                <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/pos" element={<PosPage />} />
                  <Route path="/transactions" element={<TransactionListPage />} />
                  <Route path="/transactions/:id" element={<TransactionDetailPage />} />
                  <Route path="/quotations" element={<QuotationListPage />} />
                  <Route path="/quotations/new" element={<NewQuotationPage />} />
                  <Route path="/quotations/:id" element={<QuotationDetailPage />} />
                  <Route path="/products" element={<ProductPage />} />
                  <Route path="/materials" element={<MaterialPage />} />
                  <Route path="/materials/:materialId" element={<MaterialDetailPage />} />
                  <Route path="/customers" element={<CustomerPage />} />
                  <Route path="/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="/employees" element={<EmployeePage />} />
                  <Route path="/purchase-orders" element={<PurchaseOrderPage />} />
                  <Route path="/accounts" element={<AccountingPage />} />
                  <Route path="/accounts/:id" element={<AccountDetailPage />} />
                  <Route path="/receivables" element={<ReceivablesPage />} />
                  <Route path="/expenses" element={<ExpensePage />} />
                  <Route path="/advances" element={<EmployeeAdvancePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/account-settings" element={<AccountSettingsPage />} />
                  <Route path="/attendance" element={<AttendancePage />} />
                  <Route path="/attendance/report" element={<AttendanceReportPage />} />
                  <Route path="/stock-report" element={<StockReportPage />} />
                  <Route path="/transaction-items-report" element={<TransactionItemsReportPage />} />
                  <Route path="/role-permissions" element={<RolePermissionPage />} />
                  <Route path="/debug/product-analytics" element={<ProductAnalyticsDebugPage />} />
                  <Route path="/material-movements" element={<MaterialMovementReportPage />} />
                  <Route path="/service-material-report" element={<ServiceMaterialReportPage />} />
                  <Route path="/cash-flow" element={<CashFlowPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              )}
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;