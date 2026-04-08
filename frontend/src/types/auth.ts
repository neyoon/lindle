export interface AuthUser {
  user_id: string
  username: string
  role: string
}

export interface LoginResponse {
  token: string
  token_type: string
  user: {
    id?: string
    username: string
    role?: string
  }
}
