// Mapeo puro de las filas de list_business_orders (sin red, testeable).
export function mapBusinessOrderRow(row) {
  return Object.freeze({
    id: row.id,
    number: row.order_number,
    serviceDate: row.service_date,
    status: row.status,
    tableLabel: row.table_label,
    totalCents: row.total_cents,
    note: row.note || '',
    rejectionReason: row.rejection_reason || '',
    customer: row.customer_masked || 'Cliente Spirit',
    items: Object.freeze((Array.isArray(row.items) ? row.items : []).map((item) => Object.freeze({
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      lineTotalCents: item.line_total_cents
    }))),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    preparingAt: row.preparing_at,
    servedAt: row.served_at,
    rejectedAt: row.rejected_at,
    cancelledAt: row.cancelled_at
  });
}
