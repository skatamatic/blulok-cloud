import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { WebSocketDebugProvider } from '@/contexts/WebSocketDebugContext';
import { FMSSyncProvider, useFMSSync } from '@/contexts/FMSSyncContext';
import { FMSSyncStatusBar } from '@/components/FMS/FMSSyncStatusBar';
import { FMSSyncProgressModal } from '@/components/FMS/FMSSyncProgressModal';
import { FMSChangeReviewModal } from '@/components/FMS/FMSChangeReviewModal';
import ToastContainer from '@/components/Toast/ToastContainer';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
import { useEffect, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UserManagementPage from '@/pages/UserManagementPage';
import UserDetailsPage from '@/pages/UserDetailsPage';
import SettingsPage from '@/pages/SettingsPage';
import NotificationSettingsPage from '@/pages/NotificationSettingsPage';
import FacilitiesPage from '@/pages/FacilitiesPage';
import FacilityDetailsPage from '@/pages/FacilityDetailsPage';
import EditFacilityPage from '@/pages/EditFacilityPage';
import DevicesPage from '@/pages/DevicesPage';
import DeviceDetailsPage from '@/pages/DeviceDetailsPage';
import UnitsPage from '@/pages/UnitsPage';
import UnitsManagementPage from '@/pages/UnitsManagementPage';
import UnitDetailsPage from '@/pages/UnitDetailsPage';
import SimpleSiteMapPage from '@/pages/SimpleSiteMapPage';
import AccessHistoryPage from '@/pages/AccessHistoryPage';
import DeveloperToolsPage from '@/pages/DeveloperToolsPage';

// Global FMS modals component
function FMSModals() {
  const { syncState, hideReview } = useFMSSync();

  return (
    <>
      {/* Progress Modal - shown when sync is active, not minimized, and not showing review */}
      {syncState.isActive && !syncState.isMinimized && !syncState.showReviewModal && (
        <FMSSyncProgressModal
          isOpen={true}
          onClose={hideReview}
          facilityId={syncState.facilityId || undefined}
          facilityName={syncState.facilityName || undefined}
        />
      )}

      {/* Review Modal - shown when showReviewModal is true and not minimized */}
      {syncState.showReviewModal && !syncState.isMinimized && (
        <FMSChangeReviewModal
          isOpen={true}
          onClose={hideReview}
          changes={syncState.pendingChanges}
          onApply={async (_changeIds) => {
            // Callback after changes are applied - currently handled by modal internally
            console.log('Changes applied successfully');
          }}
          syncResult={syncState.syncResult}
          facilityName={syncState.facilityName || undefined}
        />
      )}
    </>
  );
}

// Global gateway status listener to raise toasts on any view
function GatewayStatusListener() {
  const ws = useWebSocket();
  const { addToast } = useToast();
  const lastStatusRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const subscriptionId = ws.subscribe(
      'gateway_status',
      (data: any) => {
        try {
          const gateways = data?.gateways || [];
          gateways.forEach((g: any) => {
            const prev = lastStatusRef.current[g.id];
            lastStatusRef.current[g.id] = g.status;
            if (prev && prev !== g.status) {
              // Only show toasts for actual status changes (online, offline, error)
              if (g.status === 'online' || g.status === 'offline' || g.status === 'error') {
                const statusMessage = g.status === 'online' ? 'online' : g.status === 'offline' ? 'offline' : 'error';
                addToast({
                  type: g.status === 'online' ? 'success' : 'error',
                  title: `Facility gateway is now ${statusMessage}`
                });
              }
            }
          });
        } catch (e) {
          console.error('Failed to process gateway status update', e);
        }
      },
      undefined // no error handler needed
    );
    return () => {
      if (subscriptionId) ws.unsubscribe(subscriptionId);
    };
  }, [ws]);

  return null;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WebSocketProvider>
          <ToastProvider>
            <WebSocketDebugProvider>
              <SidebarProvider>
                <DropdownProvider>
                  <FMSSyncProvider>
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

                        <Route path="/users/:userId/details" element={
                          <ProtectedRoute requireUserManagement>
                            <DashboardLayout>
                              <UserDetailsPage />
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

                        <Route path="/notification-settings" element={
                          <ProtectedRoute requireAdmin>
                            <DashboardLayout>
                              <NotificationSettingsPage />
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

                        <Route path="/devices/:deviceId" element={
                          <ProtectedRoute>
                            <DashboardLayout>
                              <DeviceDetailsPage />
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
                      <GatewayStatusListener />
                      <ToastContainer />
                      <FMSSyncStatusBar />
                      <FMSModals />
                    </div>
                  </FMSSyncProvider>
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
