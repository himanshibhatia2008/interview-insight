// Entry point for the InterviewX app inside the Lovable/TanStack Start shell.
// Loaded only in the browser (see src/routes/index.tsx) because it uses localStorage,
// the microphone, speech APIs and pdf.js.
import App from "./App.jsx";
import { AppProvider } from "./AppContext.jsx";
import "./styles/global.css";

export default function InterviewXRoot() {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
}
