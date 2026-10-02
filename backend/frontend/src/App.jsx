import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Navigate, Routes, Route } from 'react-router-dom';
import AppUpdatePrompt from './components/AppUpdatePrompt';

const LandingScreen = lazy(() => import('./pages/LandingScreen'));
const LoginScreen = lazy(() => import('./pages/LoginScreen'));
const RegisterScreen = lazy(() => import('./pages/RegisterScreen'));
const DashboardScreen = lazy(() => import('./pages/DashboardScreen'));
const PaymentScreen = lazy(() => import('./pages/PaymentScreen'));
const SuperAdminScreen = lazy(() => import('./pages/SuperAdminScreen'));
const ForgotPasswordScreen = lazy(() => import('./pages/ForgotPasswordScreen'));
const ResetPasswordScreen = lazy(() => import('./pages/ResetPasswordScreen'));
const BookingScreen = lazy(() => import('./pages/BookingScreen'));
const KioskScreen = lazy(() => import('./pages/KioskScreen'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const BarberPortal = lazy(() => import('./pages/BarberPortal'));
const LiveQueueScreen = lazy(() => import('./pages/LiveQueueScreen'));
const MaintenanceScreen = lazy(() => import('./pages/MaintenanceScreen'));

const RouteFallback = () => (
  <div className="min-h-screen bg-slate-50 px-4 py-8" dir="rtl">
    <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse" />
        جاري تحميل الصفحة
      </div>
    </div>
  </div>
);

const isStandalonePwa = () => (
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true
);

const HomeRoute = () => {
  const hasSession = Boolean(localStorage.getItem('token'));

  if (isStandalonePwa() && hasSession) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingScreen />;
};

function App() {
  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />

          <Route path="/login" element={<LoginScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/payment" element={<PaymentScreen />} />
          <Route path="/super-admin" element={<SuperAdminScreen />} />
          <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
          <Route path="/reset-password/:token" element={<ResetPasswordScreen />} />
          <Route path="/kiosk/:slug" element={<KioskScreen />} />
          <Route path="/rate/:appointmentId" element={<ReviewPage />} />
          <Route path="/barber/:slug" element={<BarberPortal />} />
          <Route path="/tv/:slug" element={<LiveQueueScreen />} />
          <Route path="/maintenance" element={<MaintenanceScreen />} />
          <Route path="/:slug" element={<BookingScreen />} />
        </Routes>
      </Suspense>
      <AppUpdatePrompt />
    </Router>
  );
}

export default App;
