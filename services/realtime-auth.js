// Mantiene el token de Realtime alineado con la sesión vigente.
//
// supabase-js solo llama a realtime.setAuth en SIGNED_IN y TOKEN_REFRESHED, y
// no en MFA_CHALLENGE_VERIFIED: tras verificar el segundo factor, los canales
// seguirían con el token AAL1 y la RLS de los pedidos del equipo (que exige
// AAL2) descartaría todos los eventos. Un turno dura horas y el token se
// renueva solo, así que se reenvía el token en cada uno de esos eventos; los
// canales ya unidos reciben el nuevo token sin volver a suscribirse.
export const REALTIME_TOKEN_EVENTS = Object.freeze(['SIGNED_IN', 'TOKEN_REFRESHED', 'MFA_CHALLENGE_VERIFIED']);

export function keepRealtimeTokenCurrent(client) {
  const { data } = client.auth.onAuthStateChange((event, session) => {
    const token = session?.access_token;
    if (!REALTIME_TOKEN_EVENTS.includes(event) || !token) return;
    // Sin await: supabase-js desaconseja bloquear dentro de onAuthStateChange.
    Promise.resolve()
      .then(() => client.realtime.setAuth(token))
      .catch(() => {
        // El canal conserva el token anterior; la siguiente renovación lo reintenta.
      });
  });
  return () => data?.subscription?.unsubscribe();
}
