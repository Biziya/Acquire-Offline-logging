const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

// During `npm run dev`, always use relative /api URLs so Vite's dev-server
// proxy handles the request. This prevents browser CORS errors between
// localhost:5173 and the ASP.NET Core backend on localhost:7047.
const apiBaseUrl = import.meta.env.DEV ? "" : configuredBaseUrl;

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}
