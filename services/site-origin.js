export const getSiteOrigin = () => window.location.origin;

export const getPasswordResetUrl = () => `${getSiteOrigin()}/reset-password`;

export const getEmailConfirmationUrl = () => `${getSiteOrigin()}/auth/confirm`;
