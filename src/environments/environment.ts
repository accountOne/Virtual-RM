export const environment = {
  production: false,
  /** Empty = same-origin relative "/api/..." calls (works with the dev proxy and
   * with the Express server serving the built Angular app). Set to an absolute
   * URL only when the frontend and backend are deployed to different origins
   * (e.g. Angular on GitHub Pages, API on Render/Railway/Fly.io). */
  apiUrl: '',
};
