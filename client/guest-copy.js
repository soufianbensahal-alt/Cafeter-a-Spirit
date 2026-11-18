// Textos de «Pedir sin cuenta». Se fusionan con el diccionario principal de
// app.js; tests/guest-ordering.test.js comprueba que ambos idiomas coinciden.
export const GUEST_COPY = Object.freeze({
  es: Object.freeze({
    guestEntryTitle: '¿Solo quieres pedir?',
    guestEntryCopy: 'Pide desde la mesa sin crear una cuenta.',
    guestEntryUnavailable: 'Para pedir desde la mesa, crea tu cuenta o pide en la barra.',
    guestStart: 'Pedir sin cuenta',
    guestStarting: 'Preparando tu pedido…',
    guestViewMenu: 'Ver la carta',
    guestBadge: 'Invitado',
    guestExit: 'Salir del modo invitado',
    guestExitTitle: '¿Salir del modo invitado?',
    guestExitCopy: 'Perderás el seguimiento de tus pedidos en este dispositivo. El local seguirá preparándolos.',
    guestExitConfirm: 'Salir',
    guestExitStay: 'Seguir pidiendo',
    guestName: 'Nombre para el pedido',
    guestNameHint: 'Lo verá el local al preparar tu pedido.',
    guestNameInvalid: 'Escribe un nombre de 2 a 30 caracteres.',
    guestTrackingReminder: '¿Quieres sumar sellos? La próxima vez, crea tu cuenta desde el inicio de la app.',
    guestUnavailable: 'Ahora mismo no se puede pedir sin cuenta. Puedes pedir en la barra.',
    guestStartError: 'No se ha podido empezar el pedido sin cuenta. Inténtalo de nuevo.',
    orderErrorGuestDisabled: 'Ahora mismo no se aceptan pedidos sin cuenta. Puedes pedir en la barra o crear una cuenta.',
    orderErrorGuestName: 'Escribe un nombre de 2 a 30 caracteres para el pedido.'
  }),
  ca: Object.freeze({
    guestEntryTitle: 'Només vols demanar?',
    guestEntryCopy: 'Demana des de la taula sense crear cap compte.',
    guestEntryUnavailable: 'Per demanar des de la taula, crea el teu compte o demana a la barra.',
    guestStart: 'Demanar sense compte',
    guestStarting: 'Preparant la teva comanda…',
    guestViewMenu: 'Veure la carta',
    guestBadge: 'Convidat',
    guestExit: 'Sortir del mode convidat',
    guestExitTitle: 'Vols sortir del mode convidat?',
    guestExitCopy: 'Perdràs el seguiment de les teves comandes en aquest dispositiu. El local les continuarà preparant.',
    guestExitConfirm: 'Sortir',
    guestExitStay: 'Continuar demanant',
    guestName: 'Nom per a la comanda',
    guestNameHint: 'El veurà el local en preparar la teva comanda.',
    guestNameInvalid: 'Escriu un nom de 2 a 30 caràcters.',
    guestTrackingReminder: 'Vols sumar segells? La propera vegada, crea el teu compte des de l’inici de l’app.',
    guestUnavailable: 'Ara mateix no es pot demanar sense compte. Pots demanar a la barra.',
    guestStartError: 'No s’ha pogut començar la comanda sense compte. Torna-ho a provar.',
    orderErrorGuestDisabled: 'Ara mateix no s’accepten comandes sense compte. Pots demanar a la barra o crear un compte.',
    orderErrorGuestName: 'Escriu un nom de 2 a 30 caràcters per a la comanda.'
  })
});
