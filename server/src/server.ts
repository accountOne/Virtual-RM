import { createApp } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

createApp().listen(PORT, () => {
  console.log(`Virtual RM API server listening on http://localhost:${PORT}`);
});
