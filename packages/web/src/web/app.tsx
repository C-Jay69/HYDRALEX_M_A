import { Route, Switch } from "wouter";
import Layout from "./components/Layout";
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
      {/* Auth pages — no layout wrapper */}
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />

      {/* Main app — wrapped in layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/analyze" component={AnalyzePage} />
            <Route path="/reports/:id" component={ReportPage} />
            <Route path="/pricing" component={PricingPage} />
            <Route path="/admin" component={AdminPage} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

export default App;
