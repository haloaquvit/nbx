export type EmployeeStatus = 'Aktif' | 'Tidak Aktif';
export type UserRole = 'cashier' | 'designer' | 'operator' | 'admin' | 'supervisor' | 'owner' | 'me' | 'ceo';

export interface Employee {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: UserRole;
  phone: string;
  address: string;
  status: EmployeeStatus;
}