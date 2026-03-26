import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import BookingScreen from './pages/BookingScreen';
import DashboardScreen from './pages/DashboardScreen';
import LoginScreen from './pages/LoginScreen';
import RegisterScreen from './pages/RegisterScreen';
import LandingScreen from './pages/LandingScreen'; // ⭐ استيراد الصفحة الرئيسية
import PaymentScreen from './pages/PaymentScreen';
import SuperAdminScreen from './pages/SuperAdminScreen';
import ForgotPasswordScreen from './pages/ForgotPasswordScreen';
import ResetPasswordScreen from './pages/ResetPasswordScreen';
import ReviewPage from './pages/ReviewPage';
import KioskScreen from './pages/KioskScreen';
import BarberPortal from './pages/BarberPortal';
import LiveQueueScreen from './pages/LiveQueueScreen';
import MaintenanceScreen from './pages/MaintenanceScreen';
function App() {
  return (
    <Router>
      <Routes>
        {/* 1. المسار الرئيسي للمنصة (Landing Page) */}
        <Route path="/" element={<LandingScreen />} />

        {/* 2. المسارات الثابتة (المنصة الإدارية) */}
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/payment" element={<PaymentScreen />} />
        <Route path="/super-admin" element={<SuperAdminScreen />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        <Route path="/reset-password/:token" element={<ResetPasswordScreen />} />
        <Route path="/:slug" element={<BookingScreen />} />
        <Route path="/kiosk/:slug" element={<KioskScreen />} />
        <Route path="/rate/:appointmentId" element={<ReviewPage />} />
        <Route path="/barber/:slug" element={<BarberPortal />} />
        <Route path="/tv/:slug" element={<LiveQueueScreen />} />
        <Route path="/maintenance" element={<MaintenanceScreen />} />
      </Routes>
    </Router>
  );
}

export default App;