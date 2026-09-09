import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** Prefixes relative "/api/..." calls with environment.apiUrl so the same code
 * works same-origin (Express-served, or the dev proxy) and cross-origin
 * (e.g. Angular on GitHub Pages calling a separately hosted backend). */
export const apiUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const isConfigured = environment.apiUrl && !environment.apiUrl.startsWith('%%');
  if (isConfigured && req.url.startsWith('/api')) {
    return next(req.clone({ url: environment.apiUrl + req.url }));
  }
  return next(req);
};
