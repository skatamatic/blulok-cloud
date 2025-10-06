import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { WebSocketDebugProvider } from '@/contexts/WebSocketDebugContext';
import ToastContainer from '@/components/Toast/ToastContainer';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UserManagementPage from '@/pages/UserManagementPage';
import SettingsPage from '@/pages/SettingsPage';
import FacilitiesPage from '@/pages/FacilitiesPage';
import FacilityDetailsPage from '@/pages/FacilityDetailsPage';
import EditFacilityPage from '@/pages/EditFacilityPage';
import DevicesPage from '@/pages/DevicesPage';
import UnitsPage from '@/pages/UnitsPage';
import UnitsManagementPage from '@/pages/UnitsManagementPage';
import UnitDetailsPage from '@/pages/UnitDetailsPage';
import SimpleSiteMapPage from '@/pages/SimpleSiteMapPage';
import AccessHistoryPage from '@/pages/AccessHistoryPage';
import DeveloperToolsPage from '@/pages/DeveloperToolsPage';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WebSocketProvider>
          <ToastProvider>
            <WebSocketDebugProvider>
              <SidebarProvider>
                <DropdownProvider>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
          <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardLayout>
                <DashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/users" element={
            <ProtectedRoute requireUserManagement>
              <DashboardLayout>
                <UserManagementPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute requireAdmin>
              <DashboardLayout>
                <SettingsPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          {/* Facility routes */}
          <Route path="/facilities" element={
            <ProtectedRoute>
              <DashboardLayout>
                <FacilitiesPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/facilities/:id" element={
            <ProtectedRoute>
              <DashboardLayout>
                <FacilityDetailsPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/facilities/:id/edit" element={
            <ProtectedRoute requireAdmin>
              <DashboardLayout>
                <EditFacilityPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/devices" element={
            <ProtectedRoute>
              <DashboardLayout>
                <DevicesPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />


          <Route path="/units" element={
            <ProtectedRoute>
              <DashboardLayout>
                <UnitsManagementPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/units/:unitId" element={
            <ProtectedRoute>
              <DashboardLayout>
                <UnitDetailsPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/units-old" element={
            <ProtectedRoute>
              <DashboardLayout>
                <UnitsPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/access-history" element={
            <ProtectedRoute>
              <DashboardLayout>
                <AccessHistoryPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/facility-sitemap" element={
            <ProtectedRoute>
              <SimpleSiteMapPage />
            </ProtectedRoute>
          } />

          <Route path="/dev-tools" element={
            <ProtectedRoute requireDevAdmin>
              <DashboardLayout>
                <DeveloperToolsPage />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          {/* Redirect unknown routes to dashboard if authenticated, otherwise to landing */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <ToastContainer />
          </div>
          </DropdownProvider>
        </SidebarProvider>
        </WebSocketDebugProvider>
        </ToastProvider>
        </WebSocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
