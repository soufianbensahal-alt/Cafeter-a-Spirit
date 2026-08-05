import { requireSupabase } from './supabase-client.js';

export class MfaServiceError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MfaServiceError';
    this.code = code;
  }
}

const mfaError = (error, fallbackCode = 'mfa_error') => {
  if (error instanceof MfaServiceError) return error;
  return new MfaServiceError(
    error?.code || fallbackCode,
    error?.message || 'No se ha podido verificar el segundo factor.',
    error
  );
};

export async function getBusinessMfaState() {
  try {
    const supabase = requireSupabase();
    const [{ data: factors, error: factorsError }, { data: assurance, error: assuranceError }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);
    if (factorsError) throw factorsError;
    if (assuranceError) throw assuranceError;
    const verifiedFactor = factors?.totp?.find((factor) => factor.status === 'verified') || null;
    return Object.freeze({
      factor: verifiedFactor,
      currentLevel: assurance?.currentLevel || 'aal1',
      nextLevel: assurance?.nextLevel || 'aal1',
      verified: Boolean(verifiedFactor && assurance?.currentLevel === 'aal2')
    });
  } catch (error) {
    throw mfaError(error, 'mfa_state_failed');
  }
}

export async function beginBusinessMfaEnrollment() {
  try {
    const supabase = requireSupabase();
    const { data: existing, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    for (const factor of existing?.all || []) {
      if (factor.factor_type === 'totp' && factor.status !== 'verified') {
        const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (cleanupError) throw cleanupError;
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Spirit Equipo'
    });
    if (error) throw error;
    if (!data?.id || !data?.totp?.qr_code) throw new MfaServiceError('mfa_enrollment_invalid', 'No se ha podido iniciar la configuración MFA.');
    return Object.freeze({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret || ''
    });
  } catch (error) {
    throw mfaError(error, 'mfa_enrollment_failed');
  }
}

export async function verifyBusinessMfa(factorId, code) {
  try {
    const cleanCode = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanCode)) throw new MfaServiceError('mfa_invalid_code', 'Introduce el código de 6 dígitos de tu aplicación autenticadora.');
    const supabase = requireSupabase();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw challengeError;
    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: cleanCode
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw mfaError(error, 'mfa_verification_failed');
  }
}
