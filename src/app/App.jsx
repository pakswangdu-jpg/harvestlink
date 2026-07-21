import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthContext';
import { CatalogProvider } from '../contexts/CatalogContext';
import AppRoutes from './routes';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CatalogProvider>
          <AppRoutes />
        </CatalogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
