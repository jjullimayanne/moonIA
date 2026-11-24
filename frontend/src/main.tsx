import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

// surface the message of Cesium DeveloperErrors (the console otherwise prints only the class name)
window.addEventListener("error", (e) => {
  if (e.error) console.error("[MoonAI] uncaught:", e.error.message, e.error.stack);
});

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
