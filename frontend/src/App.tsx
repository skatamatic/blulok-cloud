import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { WebSocketDebugProvider } from '@/contexts/WebSocketDebugContext';
import { FMSSyncProvider, useFMSSync } from '@/contexts/FMSSyncContext';
import { BluFMSDemoProvider } from '@/contexts/BluFMSDemoContext';
import { GlobalFacilityProvider } from '@/contexts/GlobalFacilityContext';
import { FacilityChangeNavigator } from '@/components/Layout/FacilityChangeNavigator';
import { BluDesignProvider } from '@/contexts/BluDesignContext';
import { FMSSyncStatusBar } from '@/components/FMS/FMSSyncStatusBar';
import { FMSSyncProgressModal } from '@/components/FMS/FMSSyncProgressModal';
import { FMSChangeReviewModal } from '@/components/FMS/FMSChangeReviewModal';
import ToastContainer from '@/components/Toast/ToastContainer';
import { useGatewayStatusToasts } from '@/hooks/useGatewayStatusToasts';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { UserRole } from '@/types/auth.types';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UserManagementPage from '@/pages/UserManagementPage';
import UserDetailsPage from '@/pages/UserDetailsPage';
import SettingsPage from '@/pages/SettingsPage';
import AddFacilityPage from '@/pages/AddFacilityPage';

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
import BluFMSDashboardPage from '@/pages/blufms/BluFMSDashboardPage';
import BluFMSFacilityMapPage from '@/pages/blufms/BluFMSFacilityMapPage';
import BluDesignViewPage from '@/pages/bludesign/BluDesignViewPage';
import BluDesignBuildPage from '@/pages/bludesign/BluDesignBuildPage';
import BluDesignImportPage from '@/pages/bludesign/BluDesignImportPage';
import BluDesignAssetsPage from '@/pages/bludesign/BluDesignAssetsPage';
import BluDesignConfigPage from '@/pages/bludesign/BluDesignConfigPage';


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
          onApply={async () => {
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

// Debounced gateway connectivity toasts (see useGatewayStatusToasts).
function GatewayStatusListener() {
  useGatewayStatusToasts();
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
                  <GlobalFacilityProvider>
                    <FacilityChangeNavigator />
                    <BluFMSDemoProvider>
                      <BluDesignProvider>
                        <FMSSyncProvider>
                        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
                      <Routes>
                        {/* Public routes */}
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/login" element={<LoginPage />} />

                        {/* Protected routes */}
                        <Route path="/dashboard" element={
                          <ProtectedRoute>
                            <DashboardLayout lockViewport>
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
                          <ProtectedRoute>
                            <DashboardLayout>
                              <UserDetailsPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        <Route path="/settings" element={
                          <ProtectedRoute requireSettingsAccess>
                            <DashboardLayout>
                              <SettingsPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        <Route path="/settings/add-facility" element={
                          <ProtectedRoute requireAdmin>
                            <DashboardLayout>
                              <AddFacilityPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        {/* Redirect old routes to unified settings page */}
                        <Route path="/notification-settings" element={<Navigate to="/settings?tab=notifications" replace />} />
                        <Route path="/storage-config" element={<Navigate to="/settings?tab=storage" replace />} />

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
                          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]}>
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

                        {/* BluFMS Routes */}
                        <Route path="/blufms/dashboard" element={
                          <ProtectedRoute>
                            <DashboardLayout>
                              <BluFMSDashboardPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        <Route path="/blufms/facility-map" element={
                          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]}>
                            <DashboardLayout>
                              <BluFMSFacilityMapPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        {/* BluDesign Routes */}
                        <Route path="/bludesign/view" element={
                          <ProtectedRoute>
                            <DashboardLayout>
                              <BluDesignViewPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        <Route path="/bludesign/build" element={
                          <ProtectedRoute>
                            <DashboardLayout>
                              <BluDesignBuildPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        <Route path="/bludesign/import" element={
                          <ProtectedRoute>
                            <DashboardLayout>
                              <BluDesignImportPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        <Route path="/bludesign/assets" element={
                          <ProtectedRoute>
                            <DashboardLayout>
                              <BluDesignAssetsPage />
                            </DashboardLayout>
                          </ProtectedRoute>
                        } />

                        <Route path="/bludesign/config" element={
                          <ProtectedRoute>
                            <DashboardLayout>
                              <BluDesignConfigPage />
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
                      </BluDesignProvider>
                    </BluFMSDemoProvider>
                  </GlobalFacilityProvider>
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
