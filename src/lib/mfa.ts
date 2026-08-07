import { supabase } from './supabase';

/**
 * Thin wrapper over Supabase Auth's real MFA API (supabase.auth.mfa.*) --
 * every call here hits Supabase directly, nothing is simulated. TOTP is
 * the only factor type Supabase Auth supports today (no SMS factor),
 * which is also the one every major authenticator app already handles,
 * so there's no gap to explain to a user setting this up.
 */

export interface TotpFactor {
  id: string;
  friendlyName?: string;
  status: 'verified' | 'unverified';
}

export async function listMfaFactors(): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.map(f => ({ id: f.id, friendlyName: f.friendly_name, status: f.status }));
}

/** Starts enrollment -- returns the QR code (as an SVG data URI) and the plain-text secret for manual entry, plus the factorId needed to verify. */
export async function enrollTotp(): Promise<{ factorId: string; qrCode: string; secret: string }> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Completes enrollment (or a login step-up) with the 6-digit code from the user's authenticator app. */
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (verifyError) throw verifyError;
}

export async function unenrollTotp(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
