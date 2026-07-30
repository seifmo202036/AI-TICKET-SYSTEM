export type UserRole = 'admin' | 'customer' | 'agent'  ;
export type SignupAccountType = 'customer' | 'agent';

export type AccountStatus = 'pending' | 'active' | 'suspended';

// data that would be written to DB
export interface UserRecord  {
    id:number,
    user_name:string,
    email:string,
    password_hash:string,
    role:UserRole,
    account_status:AccountStatus,
    created_at :Date,
    updated_at:Date
};

// data that would be displayed to users
export interface PublicRecord  {
    id: string;
    userName: string;
    email: string;
    role: UserRole;
    accountStatus: AccountStatus;
    createdAt: Date;
    accessToken?: string;
    refreshToken?: string;
};
export interface LoginResult {
  user: PublicRecord;
  accessToken: string;
  refreshToken: string;
}

// data that would be needed for users creation
export interface CreateUserData {
    userName: string;
    email: string;
    passwordHash: string;
    role: SignupAccountType;
    accountStatus: AccountStatus;
};

