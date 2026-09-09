export const environment = {
  production: true,
  // Replaced at CI build time (see .github/workflows/deploy-pages.yml) from the
  // API_URL repository variable. Left as this literal placeholder for a local
  // `ng build --configuration production` — the interceptor treats an
  // unreplaced placeholder the same as "not configured" (relative "/api/..."
  // calls, i.e. same-origin backend).
  apiUrl: '%%API_URL%%',
};
