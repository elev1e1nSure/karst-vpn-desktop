import { AppView } from './app/AppView';
import { useAppController } from './app/useAppController';
import './style.css';

export function App() {
  return <AppView controller={useAppController()} />;
}
