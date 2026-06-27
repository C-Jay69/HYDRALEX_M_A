import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AutumnProvider } from "autumn-js/react";
import "./styles.css";
import App from "./app.tsx";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<Router>
				<AutumnProvider useBetterAuth>
					<App />
				</AutumnProvider>
			</Router>
		</QueryClientProvider>
	</StrictMode>,
);
