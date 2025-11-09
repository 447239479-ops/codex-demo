import { Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { HomePage } from "@/pages/HomePage";
import { PresetsPage } from "@/pages/PresetsPage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { StylistPage } from "@/pages/StylistPage";
import { BookingPage } from "@/pages/BookingPage";
import { PrivacyPage } from "@/pages/PrivacyPage";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/presets" element={<PresetsPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/stylist" element={<StylistPage />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Route>
    </Routes>
  );
}

export default App;
