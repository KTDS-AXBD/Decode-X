import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DomainProvider } from "@/contexts/DomainContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Toaster } from "sonner";
import { Home } from "@/pages/Home";

export function App() {
  return (
    <ThemeProvider>
      <DomainProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </DomainProvider>
    </ThemeProvider>
  );
}
