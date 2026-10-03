import { Toaster } from 'sonner';
import { useTheme } from '../lib/theme.js';

// Toasts follow the app's light/dark choice, including the manual toggle.
export default function ThemedToaster() {
  const { scheme } = useTheme();
  return <Toaster position="top-center" closeButton theme={scheme} toastOptions={{ className: 'toast' }} />;
}
