// Política de privacidad y aviso legal: BORRADOR pendiente de revisión legal.
// Redactado a partir del inventario del código (13/11/2026). Los datos de la
// empresa y los puntos sin cerrar van como marcadores entre corchetes, que la
// vista resalta. Mientras quede alguno, LEGAL_DRAFT debe seguir en true.
//
// No cambia PRIVACY_POLICY_VERSION (app.js): se actualizará cuando el texto
// esté revisado, y entonces se pedirá de nuevo el consentimiento.

export const LEGAL_DRAFT = true;
export const LEGAL_UPDATED = '2026-11-13';

const COMPANY = {
  name: '[RAZÓN SOCIAL]',
  nif: '[NIF]',
  address: '[DIRECCIÓN]',
  email: '[EMAIL DE CONTACTO]'
};

export const LEGAL_CONTENT = Object.freeze({
  es: Object.freeze({
    draftBanner: 'Borrador pendiente de revisión legal. Los datos entre corchetes están por completar.',
    updated: 'Última actualización: {date}',
    privacy: {
      title: 'Política de privacidad',
      intro: 'Esta política explica qué datos personales trata la app de Cafetería Spirit (tarjeta de sellos, carta, pedidos desde la mesa y panel del equipo), para qué, durante cuánto tiempo y qué derechos tienes.',
      sections: [
        { title: '1. Responsable del tratamiento', items: [
          `Titular: ${COMPANY.name}`,
          `NIF: ${COMPANY.nif}`,
          `Domicilio: ${COMPANY.address}`,
          `Contacto para privacidad: ${COMPANY.email}`
        ] },
        { title: '2. Qué datos tratamos', paragraphs: ['Según cómo uses la app:'], items: [
          'Clientes con cuenta: correo electrónico, contraseña (guardada cifrada por nuestro proveedor de autenticación), nombre y apellidos, preferencia de mantener la sesión, versión y fecha de aceptación de esta política, tarjeta de sellos (sellos, recompensas e historial de cada sello o canje con fecha y local), solicitudes temporales de sello o canje, pedidos (mesa o recogida en barra, productos, importes, nota que escribas y horas de cada estado) y, si activas los recordatorios, los datos técnicos de la suscripción a notificaciones.',
          'Personas que piden sin cuenta (invitados): un identificador anónimo de sesión, el nombre que indiques para el pedido y tus pedidos. No tienen tarjeta de sellos ni perfil.',
          'Equipo de la cafetería: correo, contraseña, segundo factor de autenticación (TOTP), rol y local, quién valida cada sello o canje y quién gestiona cada pedido, y registros de seguridad (intentos de validación y alertas).',
          'Datos técnicos: para proteger el servicio, intentos fallidos con el código del día y registros de acceso de nuestros proveedores (dirección IP, navegador y fecha).'
        ] },
        { title: '3. Para qué los usamos y con qué base jurídica', paragraphs: ['[PENDIENTE DE VALIDACIÓN LEGAL: bases jurídicas]'], items: [
          'Gestionar tu cuenta y la tarjeta de sellos y entregarte las recompensas: ejecución de las condiciones del programa que aceptas al registrarte (art. 6.1.b RGPD).',
          'Recibir y servir tus pedidos, con o sin cuenta: ejecución de la relación de compra (art. 6.1.b RGPD).',
          'Avisarte por correo cuando consigues una recompensa: ejecución del programa (art. 6.1.b RGPD).',
          'Enviarte recordatorios por notificación: tu consentimiento, que puedes retirar desactivándolos en el perfil (art. 6.1.a RGPD).',
          'Seguridad, prevención del fraude y del abuso (código del día, límites de intentos, doble factor del equipo, alertas): interés legítimo en proteger el servicio (art. 6.1.f RGPD).',
          'Cumplir obligaciones legales cuando corresponda (art. 6.1.c RGPD).'
        ] },
        { title: '4. Cuánto tiempo los conservamos', paragraphs: ['[PENDIENTE DE VALIDAR CON LA CAFETERÍA: plazos de conservación]'], items: [
          'Cuenta, perfil, tarjeta e historial de sellos: mientras mantengas la cuenta. Al eliminarla se borran.',
          'Pedidos: 12 meses. Si eliminas tu cuenta, se borran en ese momento la nota y el nombre de tus pedidos; el resto se conserva sin vincularse a ti hasta cumplir el plazo.',
          'Invitados: la sesión anónima se elimina tras 30 días sin actividad (último pedido o último acceso) y sin pedidos en curso. Sus pedidos siguen el plazo anterior.',
          'Intentos con el código del día y solicitudes de sello o canje caducadas: 30 días.',
          'Registro de envíos de los correos de recompensa: 90 días.',
          'Alertas de seguridad del equipo: 12 meses.',
          'Suscripción a notificaciones: hasta que las desactives o elimines la cuenta.',
          'Consentimiento a esta política: mientras mantengas la cuenta, como prueba de la aceptación.'
        ] },
        { title: '5. Quién trata los datos por nuestra cuenta', paragraphs: ['Usamos proveedores que tratan los datos como encargados del tratamiento, con contrato y garantías adecuadas:'], items: [
          'Supabase (base de datos, autenticación y tiempo real): servidores en la Unión Europea (Fráncfort, Alemania).',
          'Vercel (alojamiento de la app): [REGIÓN Y PLAN DE VERCEL].',
          'Resend (envío de los correos de recompensa).',
          'Correos de confirmación y recuperación de la cuenta: [PROVEEDOR DE CORREO DE AUTENTICACIÓN].',
          'Servicios de notificaciones del navegador o del sistema (Apple, Google o Mozilla, según tu dispositivo), solo si activas los recordatorios.',
          '[PENDIENTE DE VALIDACIÓN LEGAL: transferencias internacionales y garantías (cláusulas contractuales tipo o marco de privacidad UE-EE. UU.) de los proveedores con sede fuera de la UE.]'
        ] },
        { title: '6. Lo que se guarda en tu dispositivo', paragraphs: ['La app no usa cookies publicitarias ni analítica de terceros. Guarda en el almacenamiento del navegador lo imprescindible para funcionar: tu sesión, el idioma, el tema claro u oscuro, si ya viste la presentación, tu preferencia de mantener la sesión y el carrito mientras pides. Las fuentes y archivos de la app se sirven desde nuestro propio dominio.'] },
        { title: '7. Tus derechos', paragraphs: [
          `Puedes pedir el acceso, la rectificación, la supresión, la oposición, la limitación del tratamiento y la portabilidad de tus datos, y retirar tu consentimiento en cualquier momento, escribiendo a ${COMPANY.email}. Puedes eliminar tu cuenta desde el perfil de la app.`,
          'Si consideras que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).'
        ] },
        { title: '8. Edad mínima', paragraphs: ['[PENDIENTE DE VALIDACIÓN LEGAL: edad mínima para crear una cuenta (en España, 14 años según la LOPDGDD).]'] },
        { title: '9. Cambios en esta política', paragraphs: ['Si cambiamos esta política de forma relevante, te lo mostraremos al iniciar sesión y te pediremos que aceptes la nueva versión para seguir usando tu cuenta.'] }
      ]
    },
    notice: {
      title: 'Aviso legal',
      intro: 'En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), estos son los datos del titular de esta app y sus condiciones de uso.',
      sections: [
        { title: '1. Titular', items: [
          `Titular: ${COMPANY.name}`,
          `NIF: ${COMPANY.nif}`,
          `Domicilio: ${COMPANY.address}`,
          `Correo electrónico: ${COMPANY.email}`,
          '[DATOS REGISTRALES, SI LOS HAY]'
        ] },
        { title: '2. Objeto', paragraphs: ['La app permite a los clientes de Cafetería Spirit consultar la carta, acumular sellos y canjear recompensas, y pedir desde la mesa con el código del día; y al equipo del local, gestionar sellos y pedidos. El pago se realiza en el local.'] },
        { title: '3. Condiciones de uso', paragraphs: ['Te comprometes a usar la app de buena fe, a no suplantar a otras personas, a no intentar acceder a cuentas ajenas ni eludir los límites de seguridad, y a no hacer pedidos que no vayas a recoger. Podemos suspender el acceso ante un uso abusivo. Las condiciones del programa de sellos y recompensas son las que se muestran en la app y en el local.'] },
        { title: '4. Propiedad intelectual', paragraphs: [`La marca Spirit, el logotipo, los textos, el diseño y el código de la app pertenecen a ${COMPANY.name} o se usan con licencia. Las fuentes tipográficas DM Sans y DM Serif Display se usan bajo la licencia SIL Open Font License.`] },
        { title: '5. Responsabilidad', paragraphs: ['Trabajamos para que la app funcione de forma continua y segura, pero puede haber interrupciones por mantenimiento o causas ajenas. Los enlaces a otras plataformas (por ejemplo, de reparto a domicilio) llevan a servicios de terceros con sus propias condiciones.'] },
        { title: '6. Ley aplicable', paragraphs: ['[PENDIENTE DE VALIDACIÓN LEGAL: ley aplicable (española) y juzgados competentes, respetando los derechos de las personas consumidoras.]'] }
      ]
    }
  }),
  ca: Object.freeze({
    draftBanner: 'Esborrany pendent de revisió legal. Les dades entre claudàtors estan per completar.',
    updated: 'Darrera actualització: {date}',
    privacy: {
      title: 'Política de privacitat',
      intro: 'Aquesta política explica quines dades personals tracta l’app de Cafetería Spirit (targeta de segells, carta, comandes des de la taula i panell de l’equip), per a què, durant quant de temps i quins drets tens.',
      sections: [
        { title: '1. Responsable del tractament', items: [
          `Titular: ${COMPANY.name}`,
          `NIF: ${COMPANY.nif}`,
          `Domicili: ${COMPANY.address}`,
          `Contacte per a privacitat: ${COMPANY.email}`
        ] },
        { title: '2. Quines dades tractem', paragraphs: ['Segons com facis servir l’app:'], items: [
          'Clients amb compte: correu electrònic, contrasenya (desada xifrada pel nostre proveïdor d’autenticació), nom i cognoms, preferència de mantenir la sessió, versió i data d’acceptació d’aquesta política, targeta de segells (segells, recompenses i historial de cada segell o bescanvi amb data i local), sol·licituds temporals de segell o bescanvi, comandes (taula o recollida a la barra, productes, imports, nota que escriguis i hores de cada estat) i, si actives els recordatoris, les dades tècniques de la subscripció a notificacions.',
          'Persones que demanen sense compte (convidats): un identificador anònim de sessió, el nom que indiquis per a la comanda i les teves comandes. No tenen targeta de segells ni perfil.',
          'Equip de la cafeteria: correu, contrasenya, segon factor d’autenticació (TOTP), rol i local, qui valida cada segell o bescanvi i qui gestiona cada comanda, i registres de seguretat (intents de validació i alertes).',
          'Dades tècniques: per protegir el servei, intents fallits amb el codi del dia i registres d’accés dels nostres proveïdors (adreça IP, navegador i data).'
        ] },
        { title: '3. Per a què les fem servir i amb quina base jurídica', paragraphs: ['[PENDENT DE VALIDACIÓ LEGAL: bases jurídiques]'], items: [
          'Gestionar el teu compte i la targeta de segells i lliurar-te les recompenses: execució de les condicions del programa que acceptes en registrar-te (art. 6.1.b RGPD).',
          'Rebre i servir les teves comandes, amb compte o sense: execució de la relació de compra (art. 6.1.b RGPD).',
          'Avisar-te per correu quan aconsegueixes una recompensa: execució del programa (art. 6.1.b RGPD).',
          'Enviar-te recordatoris per notificació: el teu consentiment, que pots retirar desactivant-los al perfil (art. 6.1.a RGPD).',
          'Seguretat i prevenció del frau i de l’abús (codi del dia, límits d’intents, doble factor de l’equip, alertes): interès legítim a protegir el servei (art. 6.1.f RGPD).',
          'Complir obligacions legals quan correspongui (art. 6.1.c RGPD).'
        ] },
        { title: '4. Quant de temps les conservem', paragraphs: ['[PENDENT DE VALIDAR AMB LA CAFETERIA: terminis de conservació]'], items: [
          'Compte, perfil, targeta i historial de segells: mentre mantinguis el compte. En eliminar-lo s’esborren.',
          'Comandes: 12 mesos. Si elimines el compte, s’esborren en aquell moment la nota i el nom de les teves comandes; la resta es conserva sense vincular-se a tu fins que es compleixi el termini.',
          'Convidats: la sessió anònima s’elimina després de 30 dies sense activitat (darrera comanda o darrer accés) i sense comandes en curs. Les seves comandes segueixen el termini anterior.',
          'Intents amb el codi del dia i sol·licituds de segell o bescanvi caducades: 30 dies.',
          'Registre d’enviaments dels correus de recompensa: 90 dies.',
          'Alertes de seguretat de l’equip: 12 mesos.',
          'Subscripció a notificacions: fins que les desactivis o eliminis el compte.',
          'Consentiment a aquesta política: mentre mantinguis el compte, com a prova de l’acceptació.'
        ] },
        { title: '5. Qui tracta les dades per compte nostre', paragraphs: ['Fem servir proveïdors que tracten les dades com a encarregats del tractament, amb contracte i garanties adequades:'], items: [
          'Supabase (base de dades, autenticació i temps real): servidors a la Unió Europea (Frankfurt, Alemanya).',
          'Vercel (allotjament de l’app): [REGIÓ I PLA DE VERCEL].',
          'Resend (enviament dels correus de recompensa).',
          'Correus de confirmació i recuperació del compte: [PROVEÏDOR DE CORREU D’AUTENTICACIÓ].',
          'Serveis de notificacions del navegador o del sistema (Apple, Google o Mozilla, segons el teu dispositiu), només si actives els recordatoris.',
          '[PENDENT DE VALIDACIÓ LEGAL: transferències internacionals i garanties (clàusules contractuals tipus o marc de privacitat UE-EUA) dels proveïdors amb seu fora de la UE.]'
        ] },
        { title: '6. El que es desa al teu dispositiu', paragraphs: ['L’app no fa servir galetes publicitàries ni analítica de tercers. Desa a l’emmagatzematge del navegador el que és imprescindible per funcionar: la teva sessió, l’idioma, el tema clar o fosc, si ja vas veure la presentació, la preferència de mantenir la sessió i el carretó mentre demanes. Les fonts i els fitxers de l’app se serveixen des del nostre propi domini.'] },
        { title: '7. Els teus drets', paragraphs: [
          `Pots demanar l’accés, la rectificació, la supressió, l’oposició, la limitació del tractament i la portabilitat de les teves dades, i retirar el consentiment en qualsevol moment, escrivint a ${COMPANY.email}. Pots eliminar el compte des del perfil de l’app.`,
          'Si consideres que no hem atès bé la teva sol·licitud, pots reclamar davant l’Agència Espanyola de Protecció de Dades (www.aepd.es) o l’Autoritat Catalana de Protecció de Dades quan sigui competent.'
        ] },
        { title: '8. Edat mínima', paragraphs: ['[PENDENT DE VALIDACIÓ LEGAL: edat mínima per crear un compte (a Espanya, 14 anys segons la LOPDGDD).]'] },
        { title: '9. Canvis en aquesta política', paragraphs: ['Si canviem aquesta política de manera rellevant, t’ho mostrarem en iniciar sessió i et demanarem que acceptis la nova versió per continuar fent servir el compte.'] }
      ]
    },
    notice: {
      title: 'Avís legal',
      intro: 'En compliment de la Llei 34/2002, de serveis de la societat de la informació i de comerç electrònic (LSSI-CE), aquestes són les dades del titular d’aquesta app i les seves condicions d’ús.',
      sections: [
        { title: '1. Titular', items: [
          `Titular: ${COMPANY.name}`,
          `NIF: ${COMPANY.nif}`,
          `Domicili: ${COMPANY.address}`,
          `Correu electrònic: ${COMPANY.email}`,
          '[DADES REGISTRALS, SI N’HI HA]'
        ] },
        { title: '2. Objecte', paragraphs: ['L’app permet als clients de Cafetería Spirit consultar la carta, acumular segells i bescanviar recompenses, i demanar des de la taula amb el codi del dia; i a l’equip del local, gestionar segells i comandes. El pagament es fa al local.'] },
        { title: '3. Condicions d’ús', paragraphs: ['Et comprometes a fer servir l’app de bona fe, a no suplantar altres persones, a no intentar accedir a comptes aliens ni eludir els límits de seguretat, i a no fer comandes que no recolliràs. Podem suspendre l’accés davant d’un ús abusiu. Les condicions del programa de segells i recompenses són les que es mostren a l’app i al local.'] },
        { title: '4. Propietat intel·lectual', paragraphs: [`La marca Spirit, el logotip, els textos, el disseny i el codi de l’app pertanyen a ${COMPANY.name} o es fan servir amb llicència. Les fonts tipogràfiques DM Sans i DM Serif Display es fan servir sota la llicència SIL Open Font License.`] },
        { title: '5. Responsabilitat', paragraphs: ['Treballem perquè l’app funcioni de manera contínua i segura, però hi pot haver interrupcions per manteniment o per causes alienes. Els enllaços a altres plataformes (per exemple, de repartiment a domicili) porten a serveis de tercers amb les seves pròpies condicions.'] },
        { title: '6. Llei aplicable', paragraphs: ['[PENDENT DE VALIDACIÓ LEGAL: llei aplicable (espanyola) i jutjats competents, respectant els drets de les persones consumidores.]'] }
      ]
    }
  })
});

// Rutas públicas de las páginas.
export const LEGAL_ROUTES = Object.freeze({ privacy: '/privacidad', notice: '/aviso-legal' });

export function legalPageFromPath(pathname = '') {
  const clean = String(pathname || '').replace(/\/+$/, '') || '/';
  if (clean === LEGAL_ROUTES.privacy) return 'privacy';
  if (clean === LEGAL_ROUTES.notice) return 'notice';
  return null;
}
