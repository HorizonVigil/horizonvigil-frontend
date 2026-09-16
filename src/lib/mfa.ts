import { supabase } from './supabase';

/**
 * Production-safe client wrapper around Supabase Auth MFA.
 *
 * Supported factor types in the current Supabase Auth API include TOTP
 * (authenticator apps) and phone verification. This module intentionally
 * exposes TOTP only because HorizonVigil's application flow is based on
 * authenticator apps.
 *
 * Security notes:
 * - No MFA secrets or OTP codes are logged or persisted by this module.
 * - Enrollment secrets should be displayed only in the setup UI and should
 *   never be sent to an application backend.
 * - Verifying a factor promotes the current session to AAL2; authorization
 *   enforcement still belongs in backend/API/RLS policy as appropriate.
 *
 * Supabase references:
 * https://supabase.com/docs/guides/auth/auth-mfa
 */

export interface TotpFactor {
  id: string;
  friendlyName?: string;
  status: 'verified' | 'unverified';
}

export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

const TOTP_CODE_LENGTH = 6;
const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} is required.`);
  }

  return value.trim();
}

function normalizeFactorId(factorId: string): string {
  const normalized = requireNonEmptyString(factorId, 'factorId');

  // Supabase currently returns UUID factor identifiers. Keep this validation
  // intentionally UUID-like rather than accepting arbitrary user input.
  if (!UUID_LIKE_PATTERN.test(normalized)) {
    throw new TypeError('factorId must be a valid MFA factor identifier.');
  }

  return normalized;
}

function normalizeTotpCode(code: string): string {
  const normalized = requireNonEmptyString(code, 'code').replace(/\s+/g, '');

  if (!/^\d{6}$/.test(normalized)) {
    throw new TypeError(
      `code must contain exactly ${TOTP_CODE_LENGTH} numeric digits.`,
    );
  }

  return normalized;
}

function normalizeFriendlyName(friendlyName?: string): string | undefined {
  if (friendlyName == null) {
    return undefined;
  }

  if (typeof friendlyName !== 'string') {
    throw new TypeError('friendlyName must be a string.');
  }

  const normalized = friendlyName.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Returns all TOTP factors associated with the currently authenticated user.
 *
 * Phone factors are intentionally ignored because this module is specifically
 * scoped to authenticator-app TOTP management.
 */
export async function listMfaFactors(): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error) {
    throw error;
  }

  const factors = Array.isArray(data?.totp) ? data.totp : [];

  return factors
    .filter(
      (factor) =>
        typeof factor?.id === 'string' &&
        (factor.status === 'verified' || factor.status === 'unverified'),
    )
    .map((factor) => ({
      id: factor.id,
      ...(typeof factor.friendly_name === 'string' &&
      factor.friendly_name.trim().length > 0
        ? { friendlyName: factor.friendly_name.trim() }
        : {}),
      status: factor.status,
    }));
}

/**
 * Starts TOTP enrollment.
 *
 * The returned QR code is an SVG data URI and `secret` is the manual-entry
 * secret supplied by Supabase. The caller must keep both values private and
 * discard them when the setup flow completes or is cancelled.
 */
export async function enrollTotp(
  friendlyName?: string,
): Promise<TotpEnrollment> {
  const normalizedFriendlyName = normalizeFriendlyName(friendlyName);

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    ...(normalizedFriendlyName
      ? { friendlyName: normalizedFriendlyName }
      : {}),
  });

  if (error) {
    throw error;
  }

  if (
    !data ||
    typeof data.id !== 'string' ||
    !data.totp ||
    typeof data.totp.qr_code !== 'string' ||
    typeof data.totp.secret !== 'string'
  ) {
    throw new Error('Supabase returned an invalid TOTP enrollment response.');
  }

  return {
    factorId: normalizeFactorId(data.id),
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Verifies a TOTP code against a newly enrolled factor or performs a login
 * step-up for an already enrolled factor.
 *
 * Supabase's challengeAndVerify helper performs the documented challenge and
 * verify sequence and upgrades the current session to AAL2 on success.
 */
export async function verifyTotp(
  factorId: string,
  code: string,
): Promise<void> {
  const normalizedFactorId = normalizeFactorId(factorId);
  const normalizedCode = normalizeTotpCode(code);

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: normalizedFactorId,
    code: normalizedCode,
  });

  if (error) {
    throw error;
  }
}

/**
 * Removes a TOTP factor from the current user's account.
 *
 * Supabase requires an AAL2 session before a verified factor can be
 * unenrolled. The caller should therefore complete a recent MFA step-up
 * before invoking this for an active verified factor.
 */
export async function unenrollTotp(factorId: string): Promise<void> {
  const normalizedFactorId = normalizeFactorId(factorId);

  const { error } = await supabase.auth.mfa.unenroll({
    factorId: normalizedFactorId,
  });

  if (error) {
    throw error;
  }
}
