export type DevQuickLoginAccount = {
  label: string;
  email: string;
  password: string;
};

/** Fixed credentials for dev quick-login — mirrors frontend/src/config/devTestAccounts.ts */
export const DEV_QUICK_LOGIN_ACCOUNTS: DevQuickLoginAccount[] = [
  { label: 'Admin', email: 'admin@blulok.com', password: 'Admin123!@#' },
  { label: 'Dev Admin', email: 'devadmin@blulok.com', password: 'DevAdmin123!@#' },
  { label: 'Facility Admin', email: 'dev.facilityadmin@blulok.com', password: 'DevTest123!@#' },
  { label: 'Maintenance', email: 'dev.maintenance@blulok.com', password: 'DevTest123!@#' },
  { label: 'Tenant', email: 'dev.tenant@blulok.com', password: 'DevTest123!@#' },
];

/** Accounts suitable for user catalog import (admin APIs). */
export const DEV_CATALOG_LOGIN_ACCOUNTS = DEV_QUICK_LOGIN_ACCOUNTS.filter((a) =>
  ['Admin', 'Dev Admin'].includes(a.label),
);
