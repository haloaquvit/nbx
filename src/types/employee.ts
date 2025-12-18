export type EmployeeStatus = 'Aktif' | 'Tidak Aktif';
export type UserRole =
  | 'cashier'
  | 'designer'
  | 'operator'
  | 'admin'
  | 'supervisor'
  | 'owner'
  | 'me'
  | 'ceo'
  | 'driver'
  | 'helper'
  | 'sales'
  | 'super_admin'
  | 'head_office_admin'
  | 'branch_admin';

export interface Employee {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: UserRole;
  phone: string;
  address: string;
  status: EmployeeStatus;
  branchId?: string; // Branch ID untuk multi-branch support
}