export type UserRole = 'cashier' | 'designer' | 'operator' | 'admin' | 'supervisor' | 'owner' | 'me' | 'ceo';

export interface User {
  id: string;
  name: string;
  role: UserRole;
}