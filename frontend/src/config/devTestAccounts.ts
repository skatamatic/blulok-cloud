export interface DevQuickLoginAccount {
  label: string;
  email: string;
  password: string;
}

/** Fixed credentials for dev quick-login buttons on the login page. */
export const DEV_QUICK_LOGIN_ACCOUNTS: DevQuickLoginAccount[] = [
  { label: 'Admin', email: 'admin@blulok.com', password: 'Admin123!@#' },
  { label: 'Dev Admin', email: 'devadmin@blulok.com', password: 'DevAdmin123!@#' },
  { label: 'Facility Admin', email: 'dev.facilityadmin@blulok.com', password: 'DevTest123!@#' },
  { label: 'Maintenance', email: 'dev.maintenance@blulok.com', password: 'DevTest123!@#' },
  { label: 'Tenant', email: 'dev.tenant@blulok.com', password: 'DevTest123!@#' },
];
