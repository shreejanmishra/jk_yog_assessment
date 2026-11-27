import dotenv from 'dotenv';
import { createApp } from './app';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = Number(process.env.API_PORT ?? 8787);
const app = createApp();

app.listen(PORT, () => {
  console.log(`[api] Sharad Utsav Express 5 API listening on http://localhost:${PORT}`);
});
