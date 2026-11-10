import { requireSupabase } from './supabase-client.js';
import { ACTIVE_ORDER_STATUSES } from './order-monitor.js';

export class OrderServiceError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = 'OrderServiceError';
    this.code = code;
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function toOrderServiceError(error) {
  if (error instanceof OrderServiceError) return error;
  const message = String(error?.message || '');
  if (isOffline() || error?.name === 'TypeError' || /fetch|network|load failed/i.test(message)) {
    return new OrderServiceError('network_error', error);
  }
  if (/not_authenticated|JWT|jwt/.test(message) || error?.code === 'PGRST301') {
    return new OrderServiceError('not_authenticated', error);
  }
  return new OrderServiceError('unexpected', error);
}

const guard = async (operation) => {
  if (isOffline()) throw new OrderServiceError('network_error');
  try {
    return await operation();
  } catch (error) {
    throw toOrderServiceError(error);
  }
};

const firstRow = (data) => Array.isArray(data) ? data[0] : data;

export const ORDER_COLUMNS = 'id, order_number, status, table_label, total_cents, note, rejection_reason, created_at, updated_at, order_items(product_id, product_name, quantity, unit_price_cents, line_total_cents, position)';

export function mapOrderRow(row) {
  return Object.freeze({
    id: row.id,
    number: row.order_number,
    status: row.status,
    tableLabel: row.table_label,
    totalCents: row.total_cents,
    note: row.note || '',
    rejectionReason: row.rejection_reason || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: Object.freeze([...(row.order_items || [])]
      .sort((a, b) => a.position - b.position)
      .map((item) => Object.freeze({
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        lineTotalCents: item.line_total_cents
      })))
  });
}

export const getOrderingContext = () => guard(async () => {
  const { data, error } = await requireSupabase().rpc('get_own_ordering_context');
  if (error) throw error;
  const row = firstRow(data);
  if (!row?.business_id) return null;
  return Object.freeze({
    businessId: row.business_id,
    orderingEnabled: Boolean(row.ordering_enabled),
    eligible: Boolean(row.eligible)
  });
});

export const getOrderableProducts = (businessId) => guard(async () => {
  const { data, error } = await requireSupabase()
    .from('products')
    .select('id, price_cents, is_available, in_catalog')
    .eq('business_id', businessId);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, Object.freeze({
    priceCents: row.price_cents,
    available: Boolean(row.is_available),
    inCatalog: Boolean(row.in_catalog)
  })]));
});

export const createOrder = ({ businessId, code, tableLabel, items, note }) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('create_order', {
    p_business_id: businessId,
    p_order_code: code,
    p_table_label: tableLabel,
    p_items: items,
    p_note: note || null
  });
  if (error) throw error;
  const row = firstRow(data);
  if (!row?.status) throw new OrderServiceError('unexpected');
  return Object.freeze({ status: row.status, orderId: row.order_id, orderNumber: row.order_number });
});

export const getOwnOrders = ({ activeOnly = false, limit = 20 } = {}) => guard(async () => {
  let query = requireSupabase()
    .from('orders')
    .select(ORDER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (activeOnly) query = query.in('status', ACTIVE_ORDER_STATUSES);
  const { data, error } = await query;
  if (error) throw error;
  return Object.freeze((data || []).map(mapOrderRow));
});

export const getOwnOrder = (orderId) => guard(async () => {
  const { data, error } = await requireSupabase()
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapOrderRow(data) : null;
});

export const cancelOwnOrder = (orderId) => guard(async () => {
  const { data, error } = await requireSupabase().rpc('cancel_own_order', { p_order_id: orderId });
  if (error) throw error;
  return String(data);
});

export function subscribeToOwnOrders(customerId, { onChange, onStatus } = {}) {
  const supabase = requireSupabase();
  const channel = supabase
    .channel(`own-orders-${crypto.randomUUID()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: `customer_id=eq.${customerId}`
    }, (payload) => onChange?.(payload))
    .subscribe((status) => onStatus?.(status));
  return () => supabase.removeChannel(channel);
}
