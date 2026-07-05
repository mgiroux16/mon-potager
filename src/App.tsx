import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './components/AuthGate'
import { UpdateBanner } from './components/UpdateBanner'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { JournalPage } from './pages/JournalPage'
import { QuickAddPage } from './pages/QuickAddPage'
import { VoiceReviewPage } from './pages/VoiceReviewPage'
import { GardenPage } from './pages/GardenPage'
import { GardenMapPage } from './pages/GardenMapPage'
import { HarvestPage } from './pages/HarvestPage'
import { WaterPage } from './pages/WaterPage'
import { SeasonSummaryPage } from './pages/SeasonSummaryPage'
import { CalendarPage } from './pages/CalendarPage'
import { DiagnosticsPage } from './pages/DiagnosticsPage'
import { SettingsPage } from './pages/SettingsPage'
import { CarnetPage } from './pages/CarnetPage'
import { JardinSectionPage } from './pages/JardinSectionPage'
import { PilotageSectionPage } from './pages/PilotageSectionPage'
import { ArgentPage } from './pages/ArgentPage'
import { AssistantPage } from './pages/AssistantPage'
import { ReconciliationDevPage } from './pages/ReconciliationDevPage'

function App() {
  return (
    <>
      {/* Hors AuthGate : la mise à jour doit être proposée même sur l'écran de connexion. */}
      <UpdateBanner />
      <AuthGate>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Aujourd'hui */}
            <Route index element={<DashboardPage />} />

            {/* Carnet */}
            <Route path="carnet" element={<CarnetPage />}>
              <Route index element={<Navigate to="journal" replace />} />
              <Route path="journal" element={<JournalPage />} />
              <Route path="diagnostics" element={<DiagnosticsPage />} />
              <Route path="assistant" element={<AssistantPage />} />
            </Route>

            {/* Saisie rapide — bouton central */}
            <Route path="ajouter" element={<QuickAddPage />} />
            <Route path="revue-vocale" element={<VoiceReviewPage />} />

            {/* Jardin */}
            <Route path="jardin" element={<JardinSectionPage />}>
              <Route index element={<Navigate to="parcelles" replace />} />
              <Route path="parcelles" element={<GardenPage />} />
              <Route path="carte" element={<GardenMapPage />} />
              <Route path="eau" element={<WaterPage />} />
              <Route path="verger" element={<GardenPage />} />
            </Route>

            {/* Pilotage */}
            <Route path="pilotage" element={<PilotageSectionPage />}>
              <Route index element={<Navigate to="bilan" replace />} />
              <Route path="bilan" element={<SeasonSummaryPage />} />
              <Route path="recoltes" element={<HarvestPage />} />
              <Route path="argent" element={<ArgentPage />} />
              <Route path="calendrier" element={<CalendarPage />} />
            </Route>

            {/* Réglages */}
            <Route path="reglages" element={<SettingsPage />} />

            {/* Outil dev, etape 2 migration cloud-first : pas de lien dans la nav,
                accessible uniquement via l'URL #/dev/reconciliation */}
            <Route path="dev/reconciliation" element={<ReconciliationDevPage />} />

            {/* Redirects depuis les anciennes routes */}
            <Route path="journal" element={<Navigate to="/carnet/journal" replace />} />
            <Route path="eau" element={<Navigate to="/jardin/eau" replace />} />
            <Route path="recoltes" element={<Navigate to="/pilotage/recoltes" replace />} />
            <Route path="bilan" element={<Navigate to="/pilotage/bilan" replace />} />
            <Route path="calendrier" element={<Navigate to="/pilotage/calendrier" replace />} />
            <Route path="diagnostics" element={<Navigate to="/carnet/diagnostics" replace />} />
            <Route path="plus" element={<Navigate to="/pilotage" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      </AuthGate>
    </>
  )
}

export default App
