import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import projectRoutes from './routes/project.routes';
import lotRoutes from './routes/lot.routes';
import dashboardRoutes from './routes/dashboard.routes';
import documentRoutes from './routes/document.routes';
import personRoutes from './routes/person.routes';
import contractRoutes from './routes/contract.routes';
import financeRoutes from './routes/finance.routes';
import expenseRoutes from './routes/expense.routes';
import { authenticate } from './middlewares/authMiddleware';
import { downloadUpload } from './controllers/upload.controller';
import serviceRoutes from './routes/service.routes';
import blockRoutes from './routes/block.routes';
import mapRoutes from './routes/map.routes';
import reportRoutes from './routes/reports.routes';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';

const app = express();

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In development allow all origins to avoid CORS issues with Vite dev server ports
if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
} else {
  const defaultOrigins = ['http://localhost:5173', 'http://localhost:5174'];
  app.use(cors({ origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || defaultOrigins }));
}

app.get('/uploads/documents/:fileName', authenticate, downloadUpload);
app.use('/uploads', authenticate, (_req, res) => { res.status(404).json({ success: false, message: 'Arquivo não encontrado.' }); });

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Genesis REURB API',
      version: '1.0.0',
      description: 'API para gestão de projetos de regularização fundiária urbana',
    },
  },
  apis: ['./src/routes/*.ts'],
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/people', personRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/reports', reportRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
