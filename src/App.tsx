import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { JournalPage } from './pages/JournalPage'
import { QuickAddPage } from './pages/QuickAddPage'
import { VoiceReviewPage } from './pages/VoiceReviewPage'
import { GardenPage } from './pages/GardenPage'
import { HarvestPage } from './pages/HarvestPage'
import { WaterPage } from './pages/WaterPage'
import { SeasonSummaryPage } from './pages/SeasonSummaryPage'
import { CalendarPage } from './pages/CalendarPage'
import { SettingsPage } from './pages/SettingsPage'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="ajouter" element={<QuickAddPage />} />
          <Route path="revue-vocale" element={<VoiceReviewPage />} />
          <Route path="jardin" element={<GardenPage />} />
          <Route path="recoltes" element={<HarvestPage />} />
          <Route path="eau" element={<WaterPage />} />
          <Route path="bilan" element={<SeasonSummaryPage />} />
          <Route path="calendrier" element={<CalendarPage />} />
          <Route path="reglages" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
