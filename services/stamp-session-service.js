import QRCode from 'qrcode';
import { requireSupabase } from './supabase-client.js';

const QR_PREFIX = 'SPIRIT:STAMP:V1:';

const STATUS_MESSAGES = Object.freeze({
  invalid_code: 'El código no es correcto. Revísalo e inténtalo de nuevo.',
  invalid_qr: 'QR no válido. Utiliza un QR de fidelización de Spirit.',
  invalid_version: 'Esta versión del QR ya no es compatible. Pide al cliente que genere uno nuevo.',
  expired: 'La solicitud ha caducado. Pide al cliente que genere una nueva.',
  used: 'Esta solicitud ya no está disponible. Pide al cliente que genere una nueva.',
  wrong_business: 'Este QR pertenece a otro negocio y no puede validarse aquí.',
  rate_limited: 'Demasiados intentos. Espera un minuto antes de volver a probar.',
  not_authorized: 'Tu sesión no tiene permisos activos para realizar esta operación.',
  not_authenticated: 'La sesión de empleado ha caducado. Inicia sesión de nuevo.',
  not_found: 'No se ha encontrado la solicitud. Vuelve a validar el QR o el código.',
  inactive_program: 'El programa de fidelización ya no está activo.',
  already_processed: 'Esta solicitud ya había sido procesada.'
});

export class StampSessionError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'StampSessionError';
    this.code = code;
  }
}

const firstRow = (data) => Array.isArray(data) ? data[0] : data;

const toServiceError = (error) => {
  if (error instanceof StampSessionError) return error;
  const message = String(error?.message || '');
  const knownCode = [
    'not_authenticated',
    'customer_card_not_available',
    'creation_rate_limited',
    'code_generation_failed'
  ].find((code) => message.includes(code));
  const messages = {
    not_authenticated: 'Inicia sesión para generar una solicitud de sello.',
    customer_card_not_available: 'Tu tarjeta Spirit todavía no está activa.',
    creation_rate_limited: 'Has generado varias solicitudes. Espera unos minutos antes de intentarlo de nuevo.',
    code_generation_failed: 'No se ha podido generar un código seguro. Inténtalo de nuevo.'
  };
  if (knownCode) return new StampSessionError(knownCode, messages[knownCode], error);
  if (error?.name === 'TypeError' || /fetch|network/i.test(message)) {
    return new StampSessionError('network_error', 'No se ha podido conectar con Spirit. Revisa tu conexión.', error);
  }
  return new StampSessionError('unexpected', 'No se ha podido completar la solicitud. Inténtalo de nuevo.', error);
};

export async function getOwnCustomerCard() {
  const { data, error } = await requireSupabase()
    .from('customer_cards')
    .select('id, current_stamps, available_rewards')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw toServiceError(error);
  if (!data) throw new StampSessionError('customer_card_not_available', 'Tu tarjeta Spirit todavía no está activa.');
  return Object.freeze(data);
}

export async function createStampRequest() {
  try {
    const card = await getOwnCustomerCard();
    const { data, error } = await requireSupabase().rpc('create_stamp_request', {
      p_customer_card_id: card.id
    });
    if (error) throw error;
    const row = firstRow(data);
    if (!row?.token || !/^\d{6}$/.test(row.short_code || '') || !row.expires_at) {
      throw new StampSessionError('invalid_response', 'La respuesta de la solicitud no es válida.');
    }

    const qrContent = `${QR_PREFIX}${row.token}`;
    const qrDataUrl = await QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
      color: { dark: '#171612', light: '#fffaf0' }
    });

    return Object.freeze({
      qrDataUrl,
      shortCode: row.short_code,
      expiresAt: row.expires_at
    });
  } catch (error) {
    throw toServiceError(error);
  }
}

const validatedSession = (row, source) => {
  if (!row || row.status !== 'ok') {
    const code = row?.status || 'unexpected';
    throw new StampSessionError(code, STATUS_MESSAGES[code] || 'No se ha podido validar la solicitud.');
  }
  if (!row.stamp_session_id) {
    throw new StampSessionError('invalid_response', 'La validación no ha devuelto una sesión confirmable.');
  }
  return Object.freeze({
    id: row.stamp_session_id,
    source,
    customer: row.customer_masked,
    customerMasked: row.customer_masked,
    program: row.program_name,
    currentProgress: row.current_progress,
    nextProgress: row.next_progress,
    goal: row.goal,
    reward: row.reward_description,
    status: 'pending'
  });
};

export async function validateStampCode(businessId, rawCode) {
  const code = String(rawCode ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) throw new StampSessionError('invalid_code', 'Introduce un código de 6 dígitos.');
  try {
    const { data, error } = await requireSupabase().rpc('validate_stamp_code', {
      p_business_id: businessId,
      p_code: code
    });
    if (error) throw error;
    return validatedSession(firstRow(data), 'manual');
  } catch (error) {
    throw toServiceError(error);
  }
}

export async function validateStampQr(businessId, rawContent) {
  const content = String(rawContent ?? '').trim();
  if (!content.startsWith('SPIRIT:STAMP:')) {
    throw new StampSessionError('invalid_qr', STATUS_MESSAGES.invalid_qr);
  }
  if (!content.startsWith(QR_PREFIX)) {
    throw new StampSessionError('invalid_version', STATUS_MESSAGES.invalid_version);
  }
  if (!/^SPIRIT:STAMP:V1:[0-9a-f]{64}$/.test(content)) {
    throw new StampSessionError('invalid_qr', STATUS_MESSAGES.invalid_qr);
  }
  try {
    const { data, error } = await requireSupabase().rpc('validate_stamp_qr', {
      p_business_id: businessId,
      p_qr: content
    });
    if (error) throw error;
    return validatedSession(firstRow(data), 'qr');
  } catch (error) {
    throw toServiceError(error);
  }
}

export async function confirmStampSession(stampSessionId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(stampSessionId || ''))) {
    throw new StampSessionError('not_found', STATUS_MESSAGES.not_found);
  }
  try {
    const { data, error } = await requireSupabase().rpc('confirm_stamp_session', {
      p_stamp_session_id: stampSessionId
    });
    if (error) throw error;
    const row = firstRow(data);
    if (!['confirmed', 'already_processed'].includes(row?.status)) {
      const code = row?.status || 'unexpected';
      throw new StampSessionError(code, STATUS_MESSAGES[code] || 'No se ha podido confirmar el sello.');
    }
    return Object.freeze({
      status: row.status,
      transactionId: row.transaction_id,
      progress: row.current_stamps,
      availableRewards: row.available_rewards,
      rewardEarned: row.reward_earned,
      goal: row.stamps_required,
      reward: row.reward_description,
      timestamp: row.confirmed_at
    });
  } catch (error) {
    throw toServiceError(error);
  }
}

export async function getBusinessStampHistory(businessId, limit = 10) {
  try {
    const { data, error } = await requireSupabase().rpc('get_business_stamp_history', {
      p_business_id: businessId,
      p_limit: Math.min(Math.max(Number(limit) || 10, 1), 50)
    });
    if (error) throw error;
    return Object.freeze((data || []).map((row) => Object.freeze({
      id: row.transaction_id,
      timestamp: row.occurred_at,
      customerMasked: row.customer_masked,
      result: row.result,
      progress: `${row.current_stamps} de ${row.stamps_required}`,
      rewardEarned: row.reward_earned
    })));
  } catch (error) {
    throw toServiceError(error);
  }
}
