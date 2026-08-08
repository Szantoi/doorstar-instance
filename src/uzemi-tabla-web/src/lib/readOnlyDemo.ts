/**
 * Release-only presentation profile. Vite replaces this at build time, so the
 * normal product build remains unchanged unless it is explicitly enabled.
 */
export const isReadOnlyDemo = import.meta.env.VITE_READ_ONLY_DEMO === "true";
