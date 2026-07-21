import { Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from '../features/landing/LandingPage';
import PublicFarmerProfile from '../features/landing/PublicFarmerProfile';
import AuthPage from '../features/auth/AuthPage';
import ForgotPasswordPage from '../features/auth/ForgotPasswordPage';
import ResetPasswordPage from '../features/auth/ResetPasswordPage';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import FarmerDashboard from '../features/farmer/FarmerDashboard';
import FarmerProducts from '../features/farmer/FarmerProducts';
import FarmerOrders from '../features/farmer/FarmerOrders';
import FarmerDonations from '../features/farmer/FarmerDonations';
import FarmerDemandForecast from '../features/farmer/FarmerDemandForecast';
import BuyerDashboard from '../features/buyer/BuyerDashboard';
import BuyerOrders from '../features/buyer/BuyerOrders';
import Marketplace from '../features/marketplace/Marketplace';
import ProductDetails from '../features/marketplace/ProductDetails';
import OrderTracking from '../features/orders/OrderTracking';
import OrderReceipt from '../features/orders/OrderReceipt';
import GcashPaymentPage from '../features/payments/GcashPaymentPage';
import MessageThreads from '../features/messages/MessageThreads';
import MessageThread from '../features/messages/MessageThread';
import DirectMessageThread from '../features/messages/DirectMessageThread';
import Profile from '../features/profile/Profile';
import MarketInsights from '../features/market/MarketInsights';
import FarmerMapPage from '../features/map/FarmerMapPage';
import StakeholderDashboard from '../features/stakeholder/StakeholderDashboard';
import StakeholderDonations from '../features/stakeholder/StakeholderDonations';
import StakeholderRequests from '../features/stakeholder/StakeholderRequests';
import AdminDashboard from '../features/admin/AdminDashboard';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/farmers/:id" element={<PublicFarmerProfile />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute allowedRoles={['farmer']} />}>
        <Route path="/farmer-dashboard" element={<FarmerDashboard />} />
        <Route path="/farmer-products" element={<FarmerProducts />} />
        <Route path="/farmer-orders" element={<FarmerOrders />} />
        <Route path="/farmer-donations" element={<FarmerDonations />} />
        <Route path="/demand-forecast" element={<FarmerDemandForecast />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['buyer']} />}>
        <Route path="/buyer-dashboard" element={<BuyerDashboard />} />
        <Route path="/buyer-orders" element={<BuyerOrders />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['farmer', 'buyer', 'stakeholder']} />}>
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/products/:id" element={<ProductDetails />} />
        <Route path="/orders/:id" element={<OrderTracking />} />
        <Route path="/orders/:id/receipt" element={<OrderReceipt />} />
        <Route path="/orders/:id/pay/gcash" element={<GcashPaymentPage />} />
        <Route path="/messages" element={<MessageThreads />} />
        <Route path="/messages/direct/:userId" element={<DirectMessageThread />} />
        <Route path="/messages/:orderId" element={<MessageThread />} />
        <Route path="/market-insights" element={<MarketInsights />} />
        <Route path="/farmer-map" element={<FarmerMapPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['stakeholder']} />}>
        <Route path="/stakeholder-dashboard" element={<StakeholderDashboard />} />
        <Route path="/stakeholder-orders" element={<BuyerOrders />} />
        <Route path="/stakeholder-donations" element={<StakeholderDonations />} />
        <Route path="/stakeholder-requests" element={<StakeholderRequests />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['farmer', 'buyer', 'stakeholder']} />}>
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/admin-users" element={<AdminDashboard />} />
        <Route path="/admin-catalog" element={<AdminDashboard />} />
        <Route path="/admin-price-monitoring" element={<AdminDashboard />} />
        <Route path="/admin-orders" element={<AdminDashboard />} />
        <Route path="/admin-donations" element={<AdminDashboard />} />
        <Route path="/admin-reports" element={<AdminDashboard />} />
        <Route path="/admin-profile" element={<AdminDashboard />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
