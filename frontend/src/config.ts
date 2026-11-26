// Empty in dev: Vite proxies /api to FastAPI. Set VITE_BACKEND_URL for a separate host.
export const API_URL: string = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, "") ?? "";
