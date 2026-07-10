import { Sparkles, ShoppingBag, PackageSearch, TrendingUp } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import DataTable from '../../components/dashboard/DataTable';
import StatusBarChart from '../../components/charts/StatusBarChart';
import { useAuth } from '../auth/AuthContext';
import { DEMAND_SIGNAL_LABELS, getDemandForecast } from '../../services/demandForecastService';
import { farmerNavItems } from './farmerNav';

const SIGNAL_TONE_CLASS = {
  opportunity: 'status-bar-warning',
  steady: 'status-bar-good',
  none: 'status-bar-neutral',
};

export default function FarmerDemandForecast() {
  const { currentUser } = useAuth();
  const forecast = getDemandForecast(90);
  const opportunities = forecast.filter((entry) => entry.signal === 'opportunity');
  const totalOrders = forecast.reduce((sum, entry) => sum + entry.orderCount, 0);
  const totalQuantity = forecast.reduce((sum, entry) => sum + entry.quantityOrdered, 0);

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="Demand forecast"
      subtitle="See which crop categories buyers are ordering most, and where demand is outpacing current listings — last 90 days."
    >
      <section className="stats-grid">
        <StatCard label="Categories tracked" value={forecast.length} icon={<PackageSearch size={20} />} />
        <StatCard label="Orders (last 90 days)" value={totalOrders} icon={<ShoppingBag size={20} />} />
        <StatCard label="Quantity ordered" value={totalQuantity} icon={<TrendingUp size={20} />} />
        <StatCard label="Categories worth planting" value={opportunities.length} icon={<Sparkles size={20} />} />
      </section>

      {opportunities.length ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Opportunity</p>
              <h2>Demand is outpacing supply in {opportunities.length} categor{opportunities.length === 1 ? 'y' : 'ies'}</h2>
            </div>
          </div>
          <p className="muted">
            {opportunities.map((entry) => entry.category).join(', ')} — buyers are ordering more than current active listings can cover.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Last 90 days</p>
            <h2>Quantity ordered by category</h2>
          </div>
        </div>
        <StatusBarChart
          data={forecast.map((entry) => ({ key: entry.category, count: entry.quantityOrdered, ...entry }))}
          labelFor={(entry) => entry.category}
          toneClassFor={(entry) => SIGNAL_TONE_CLASS[entry.signal]}
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Detail</p>
            <h2>Demand by category</h2>
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'category', label: 'Category' },
            { key: 'orderCount', label: 'Orders' },
            { key: 'quantityOrdered', label: 'Quantity ordered' },
            { key: 'activeListings', label: 'Active listings' },
            { key: 'signal', label: 'Signal', render: (row) => DEMAND_SIGNAL_LABELS[row.signal] },
          ]}
          rows={forecast.map((entry) => ({ ...entry, id: entry.category }))}
          emptyMessage="No order activity yet."
        />
      </section>
    </AppShell>
  );
}
