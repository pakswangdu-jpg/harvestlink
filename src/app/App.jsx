import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthContext';
import { CatalogProvider } from '../contexts/CatalogContext';
import { CartProvider } from '../contexts/CartContext';
import { ToastProvider } from '../contexts/ToastContext';
import AppRoutes from './routes';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <CartProvider>
            <CatalogProvider>
              <AppRoutes />
            </CatalogProvider>
          </CartProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
