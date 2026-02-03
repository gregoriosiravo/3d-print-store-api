export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    emailVerified: boolean;
  };
    message?: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface VerifyEmailRequest {
  token: string;
}