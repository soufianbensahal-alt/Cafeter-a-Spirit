// Regla pura del reconsentimiento (tests/privacy-reconsent.test.js).
// Las versiones son fechas AAAA-MM-DD: se comparan como texto.
export const needsReconsent = (latestAccepted, currentVersion) => !latestAccepted || String(latestAccepted) < String(currentVersion);
