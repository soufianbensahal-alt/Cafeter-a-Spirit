import { requireSupabase } from './supabase-client.js';
import { OrderServiceError, toOrderServiceError } from './order-service.js';
import { mapBusinessOrderRow } from './business-order-rows.js';

export { mapBusinessOrderRow };

// Datos del panel de pedidos del equipo. Toda escritura pasa por RPC
// SECURITY DEFINER que exigen miembro activo con AAL2.

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const guard = async (operation) => {
  if (isOffline()) throw new OrderServiceError('network_error');
  try {
    return await operation();
  } catch (error) {
    if (error instanceof OrderServiceError) throw error;
    if (error?.code === '42501' || /not_authorized/.test(String(error?.message || ''))) {
      throw new OrderServiceError('not_authorized', error);
    }
    throw toOrderServiceError(error);
  }
};

const firstRow = (data) => Array.isArray(data) ? data[0] : data;

// Resultado textual de una RPC ('ok', 'invalid_transition', …).
const statusResult = (data) => String(firstRow(data)?.status ?? data ?? 'unexpected');

export const listBusinessOrders = (businessId) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('list_business_orders', { p_business_id: businessId });
  if (error) throw error;
  return Object.freeze((data || []).map(mapBusinessOrderRow));
});

// Historial: pedidos de un día de servicio (Madrid). «Fuera de rango» y «fecha
// no válida» son respuestas normales del panel, no una sesión perdida.
const HISTORY_ERRORS = Object.freeze(['history_out_of_range', 'invalid_date']);

export const listBusinessOrdersByDate = async (businessId, serviceDate) => {
  try {
    return await guard(async () => {
      const { data, error } = await requireSupabase().rpc('list_business_orders_by_date', {
        p_business_id: businessId,
        p_service_date: serviceDate
      });
      if (error) {
        const known = HISTORY_ERRORS.find((code) => String(error.message || '').includes(code));
        if (known) throw new OrderServiceError(known, error);
        throw error;
      }
      return Object.freeze((data || []).map(mapBusinessOrderRow));
    });
  } catch (error) {
    throw error instanceof OrderServiceError ? error : new OrderServiceError('unexpected', error);
  }
};

export const updateBusinessOrderStatus = (orderId, status, reason = null) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('update_order_status', {
    p_order_id: orderId,
    p_status: status,
    p_reason: reason
  });
  if (error) throw error;
  return statusResult(data);
});

export const getOrderingSettings = (businessId) => guard(async () => {
  const { data, error } = await requireSupabase()
    .from('business_ordering_settings')
    .select('ordering_enabled, pilot_only')
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw error;
  return Object.freeze({
    orderingEnabled: Boolean(data?.ordering_enabled),
    pilotOnly: data ? Boolean(data.pilot_only) : true
  });
});

export const setOrderingEnabled = (businessId, enabled) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('set_ordering_enabled', { p_business_id: businessId, p_enabled: enabled });
  if (error) throw error;
  return statusResult(data);
});

export const setOrderingPilotOnly = (businessId, pilotOnly) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('set_ordering_pilot_only', { p_business_id: businessId, p_pilot_only: pilotOnly });
  if (error) throw error;
  return statusResult(data);
});

const mapCode = (data) => {
  const row = firstRow(data);
  return Object.freeze({
    status: String(row?.status || 'unexpected'),
    code: row?.order_code || '',
    expiresAt: row?.expires_at || null
  });
};

export const getCurrentOrderCode = (businessId) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('get_current_order_code', { p_business_id: businessId });
  if (error) throw error;
  return mapCode(data);
});

export const regenerateOrderCode = (businessId) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('regenerate_order_code', { p_business_id: businessId });
  if (error) throw error;
  return mapCode(data);
});

export const listBusinessProducts = (businessId) => guard(async () => {
  const { data, error } = await requireSupabase()
    .from('products')
    .select('id, category_id, name_es, sort_order, is_available')
    .eq('business_id', businessId)
    .eq('in_catalog', true)
    .order('category_id')
    .order('sort_order');
  if (error) throw error;
  return Object.freeze((data || []).map((row) => Object.freeze({
    id: row.id,
    categoryId: row.category_id,
    name: row.name_es,
    available: Boolean(row.is_available)
  })));
});

export const setProductAvailability = (businessId, productId, available) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('set_product_availability', {
    p_business_id: businessId,
    p_product_id: productId,
    p_is_available: available
  });
  if (error) throw error;
  return statusResult(data);
});

export const listPilotMembers = (businessId) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('list_ordering_pilot_members', { p_business_id: businessId });
  if (error) throw error;
  return Object.freeze((data || []).map((row) => Object.freeze({
    userId: row.user_id,
    customer: row.customer_masked || 'Cliente Spirit',
    email: row.email_masked || '',
    addedAt: row.added_at
  })));
});

export const addPilotMember = (businessId, email) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('add_ordering_pilot_member', { p_business_id: businessId, p_email: email });
  if (error) throw error;
  return statusResult(data);
});

export const removePilotMember = (businessId, userId) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('remove_ordering_pilot_member', { p_business_id: businessId, p_user_id: userId });
  if (error) throw error;
  return statusResult(data);
});

// La RLS de orders (rama de miembro con AAL2) filtra los eventos. El payload
// no se usa: cada evento dispara una consulta completa a list_business_orders.
//
// supabase-js fija en Realtime el token de SIGNED_IN (AAL1) como token manual
// y no lo actualiza tras verificar el MFA (MFA_CHALLENGE_VERIFIED), así que el
// canal se uniría con AAL1 y la RLS descartaría todos los eventos del equipo.
// Antes de unirse se entrega a Realtime el token vigente de la sesión (AAL2).
export function subscribeToBusinessOrders(businessId, { onChange, onStatus } = {}) {
  const supabase = requireSupabase();
  let channel = null;
  let stopped = false;
  (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
    } catch {
      // Se une con el token en caché; el polling de respaldo cubre el resto.
    }
    if (stopped) return;
    channel = supabase
      .channel(`business-orders-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `business_id=eq.${businessId}`
      }, (payload) => onChange?.(payload))
      .subscribe((status) => onStatus?.(status));
  })();
  return () => {
    stopped = true;
    if (channel) supabase.removeChannel(channel);
  };
}
