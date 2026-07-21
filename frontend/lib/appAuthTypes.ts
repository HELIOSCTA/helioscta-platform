export interface NavPositionsClientAuth {
  authConfigured: boolean;
  signedIn: boolean;
  allowed: boolean;
  localBypass: boolean;
  userEmail: string | null;
  signInUrl: string;
  signOutUrl: string;
}
