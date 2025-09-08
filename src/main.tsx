import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import AppErrorBoundary from "@/components/AppErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduce retries to minimize network calls
      retry: 1,
      retryDelay: 1000,
      // Aggressive caching - data stays fresh longer
      staleTime: 10 * 60 * 1000, // 10 minutes (increased from 5)
      gcTime: 30 * 60 * 1000, // 30 minutes (increased from 10)
      // Disable automatic refetching to reduce calls
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      // Only refetch when explicitly triggered
      refetchInterval: false,
    },
    mutations: {
      retry: 0, // No retries for mutations
    },
  },
});

// if (location.hostname.includes("vercel.app")) {
//   location.href = "https://buatan.pro";
// }

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);