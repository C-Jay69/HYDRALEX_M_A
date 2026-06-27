import { Route, Switch } from "wouter";
import Layout from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import LandingPage from "./pages/landing";
import DashboardPage from "./pages/index";
import AnalyzePage from "./pages/analyze";
import ReportPage from "./pages/report";
import SignInPage from "./pages/sign-in";
import SignUpPage from "./pages/sign-up";
import PricingPage from "./pages/pricing";
import AdminPage from "./pages/admin";

function App() {
  return (
    <Switch>
      {/* Public — no layout */}
      <Route path="/" component={LandingPage} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />

      {/* Main app — layout + auth guard */}
      <Route>
        <ProtectedRoute>
          <Layout>
            <Switch>
              <Route path="/dashboard" component={DashboardPage} />
              <Route path="/analyze" component={AnalyzePage} />
              <Route path="/reports/:id" component={ReportPage} />
              <Route path="/pricing" component={PricingPage} />
              <Route path="/admin" component={AdminPage} />
            </Switch>
          </Layout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

export default App;
