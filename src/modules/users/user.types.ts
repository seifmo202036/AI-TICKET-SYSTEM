export type UserRole = 'admin' | 'customer' | 'agent';
export type SignupRole = 'customer' | 'agent';
export type UserId = string;

export type AccountStatus = 'pending' | 'active' | 'suspended';

// data that would be written to DB
export interface DbUser {
  id: UserId;
  user_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  account_status: AccountStatus;
  created_at: Date;
  updated_at: Date;
}

// data that would be displayed to users
export interface PublicUser {
  id: UserId;
  userName: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  createdAt: Date;
}
export interface LoginResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

// data that would be needed for users creation
export interface CreateUserInput {
  userName: string;
  email: string;
  passwordHash: string;
  role: SignupRole;
  accountStatus: AccountStatus;
}
