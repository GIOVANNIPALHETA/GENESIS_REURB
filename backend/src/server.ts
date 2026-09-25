import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
import app from './app';

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Genesis REURB backend running on http://localhost:${port}`);
});
