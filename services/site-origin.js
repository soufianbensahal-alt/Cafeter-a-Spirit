export const getSiteOrigin = () => window.location.origin;

export const getGoogleCallbackUrl = () => `${getSiteOrigin()}/auth/callback`;

export const getPasswordResetUrl = () => `${getSiteOrigin()}/reset-password`;

export const getEmailConfirmationUrl = () => `${getSiteOrigin()}/`;
