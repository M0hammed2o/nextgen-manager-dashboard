import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import OrdersPage from "./pages/Orders";
import MenuPage from "./pages/MenuPage";
import SpecialsPage from "./pages/Specials";
import StaffPage from "./pages/Staff";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import BillingPage from "./pages/BillingPage";
import TillPage from "./pages/TillPage";
import IngredientsPage from '@/pages/IngredientsPage';
import RecipesPage from '@/pages/RecipesPage';
import StockPage from '@/pages/StockPage';
import StocktakePage from '@/pages/StocktakePage';
import ReceiptSettingsPage from '@/pages/ReceiptSettingsPage';
import WhatsAppConnectPage from '@/pages/WhatsAppConnectPage';
import SetupPage from '@/pages/SetupPage';
import ImportPage from '@/pages/ImportPage';
import VariancePage from '@/pages/VariancePage';
import WastagePage from '@/pages/WastagePage';
import ExternalOrdersPage from '@/pages/ExternalOrdersPage';
import ExportsPage from "./pages/ExportsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<DashboardLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/menu" element={<MenuPage />} />
                <Route path="/specials" element={<SpecialsPage />} />
                <Route path="/staff" element={<StaffPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/billing" element={<BillingPage />} />
                <Route path="/till" element={<TillPage />} />
                <Route path="/ingredients" element={<IngredientsPage />} />
                <Route path="/recipes" element={<RecipesPage />} />
                <Route path="/stock" element={<StockPage />} />
                <Route path="/stocktake" element={<StocktakePage />} />
                <Route path="/settings/receipts" element={<ReceiptSettingsPage />} />
                <Route path="/settings/whatsapp" element={<WhatsAppConnectPage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/variance" element={<VariancePage />} />
                <Route path="/wastage" element={<WastagePage />} />
                <Route path="/delivery-orders" element={<ExternalOrdersPage />} />
                <Route path="/exports" element={<ExportsPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
