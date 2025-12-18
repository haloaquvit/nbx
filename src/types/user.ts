export type UserRole =
  | 'cashier'
  | 'designer'
  | 'operator'
  | 'admin'
  | 'supervisor'
  | 'owner'
  | 'me'
  | 'ceo'
  | 'super_admin'
  | 'head_office_admin'
  | 'branch_admin';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  branchId?: string; // Branch ID untuk multi-branch support
}