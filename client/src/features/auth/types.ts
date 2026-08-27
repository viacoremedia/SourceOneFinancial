export interface AuthUser {
  id: string;
  _id?: string;
  email: string;
  name: string;
  role: 'employee' | 'admin' | 'super_admin' | 'inside_rep';
  assignedRep?: string | null;
  status?: 'invited' | 'active' | 'disabled';
  createdAt?: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
}
