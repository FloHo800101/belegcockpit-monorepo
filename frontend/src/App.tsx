import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BelegProvider } from "@/store/belegStore";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";

// Mandant feature
import MandantLayout from "@/features/mandant/components/MandantLayout";
import MandantDashboard from "@/features/mandant/pages/MandantDashboard";
import MandantMeineDaten from "@/features/mandant/pages/MandantMeineDaten";
import MandantUebergabe from "@/features/mandant/pages/MandantUebergabe";

// Mandant Wizard (URL-based routing)
import { 
  WizardLayout, 
  MonthSetup, 
  OpenItems, 
  ClusterDetail, 
  UncertainMatches, 
  Completion 
} from "@/features/mandant/pages/wizard";
import ReviewDetail from "@/features/mandant/pages/wizard/ReviewDetail";
import TestProgressiveDisclosure from "@/features/mandant/pages/TestProgressiveDisclosure";

// Kanzlei feature
import KanzleiLayout from "@/features/kanzlei/components/KanzleiLayout";
import KanzleiCockpit from "./pages/kanzlei/KanzleiCockpit";
import MandantDetail from "./pages/kanzlei/MandantDetail";
import ClusterWorklist from "./pages/kanzlei/ClusterWorklist";
import RiskQueue from "./pages/kanzlei/RiskQueue";
import ClusterWorkbench from "@/features/kanzlei/pages/ClusterWorkbench";
import InquiryPackageScreen from "@/features/kanzlei/pages/InquiryPackageScreen";
import MonthClosingScreen from "@/features/kanzlei/pages/MonthClosingScreen";
import Arbeitskorb from "@/features/kanzlei/pages/Arbeitskorb";
import { InquiryPackageProvider } from "@/features/kanzlei/stores/inquiryPackageStore";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BelegProvider>
      <InquiryPackageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              
              {/* Mandant Routes */}
              <Route path="/mandant" element={<MandantLayout />}>
                <Route index element={<MandantDashboard />} />
                <Route path="meine-daten" element={<MandantMeineDaten />} />
              </Route>
              
              {/* New Month Setup - direct to setup page */}
              <Route path="/mandant/monat/neu" element={<WizardLayout />}>
                <Route index element={<MonthSetup />} />
              </Route>
              
              {/* Mandant Wizard with URL-based routing */}
              <Route path="/mandant/monat/:monthId" element={<WizardLayout />}>
                <Route index element={<Navigate to="offene-punkte" replace />} />
                <Route path="setup" element={<MonthSetup />} />
                <Route path="offene-punkte" element={<OpenItems />} />
                <Route path="offene-punkte/:clusterId" element={<ClusterDetail />} />
                <Route path="offene-punkte/review" element={<ReviewDetail />} />
                <Route path="unsichere-matches" element={<UncertainMatches />} />
                <Route path="abschluss" element={<Completion />} />
              </Route>
              
              <Route path="/mandant/uebergabe/:monthId" element={<MandantUebergabe />} />
              
              {/* Test: Progressive Disclosure Screen */}
              <Route path="/mandant/test-progressive-disclosures" element={<TestProgressiveDisclosure />} />
              
              {/* Legacy route redirect */}
              <Route path="/mandant-wizard" element={<Navigate to="/mandant/monat/januar-2026/offene-punkte" replace />} />
              
              {/* Kanzlei Routes - All under unified KanzleiLayout */}
              <Route path="/kanzlei" element={<KanzleiLayout />}>
                <Route index element={<Navigate to="mandanten-uebersicht" replace />} />
                <Route path="mandanten-uebersicht" element={<KanzleiCockpit />} />
                <Route path="arbeitskorb" element={<Arbeitskorb />} />
                
                {/* Legacy mandant routes */}
                <Route path="mandant/:id" element={<MandantDetail />} />
                <Route path="mandant/:id/cluster/:clusterKey" element={<ClusterWorklist />} />
                <Route path="mandant/:id/risk" element={<RiskQueue />} />
                
                {/* SFA Workbench routes */}
                <Route path="mandant/:mandantId/monat/:monthId/cluster/:queueId" element={<ClusterWorkbench />} />
                <Route path="mandant/:mandantId/monat/:monthId/rueckfragen" element={<InquiryPackageScreen />} />
                <Route path="mandant/:mandantId/monat/:monthId/abschluss" element={<MonthClosingScreen />} />
              </Route>
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </InquiryPackageProvider>
    </BelegProvider>
  </QueryClientProvider>
);

export default App;
