-- Disponibilidad de la carta en tiempo real.
--
-- El cliente escucha los cambios de public.products de su negocio mientras la
-- carta o el carrito están abiertos. La política products_select_active_business
-- ya permite a cualquier usuario autenticado leer los productos de un negocio
-- activo, y Realtime la aplica con el JWT de cada suscriptor: no se expone nada
-- que el cliente no pudiera consultar ya.
alter publication supabase_realtime add table public.products;
