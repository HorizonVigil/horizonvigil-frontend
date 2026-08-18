import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useTabParam } from '../lib/useTabParam';
import { useToast } from '../lib/toast';
import { api, ApiError, friendlyErrorMessage, type BillingPlan, type AdminCoupon, type EnterpriseContract, type AdminRevenue } from '../lib/api';

const TABS = ['Overview', 'Plans', 'Coupons', 'Enterprise'] as const;
type Tab = typeof TABS[number];

function formatCents(cents: number, currency = 'usd'): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 });
}
function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Platform-staff billing console — gated server-side by PLATFORM_ADMIN_EMAILS,
 * not by anything client-side (there's no "platform admin" RBAC role, see
 * admin.ts's doc comment in cloudops-billing). A non-admin hitting this page
 * just gets a 403 from every call below; there's no route guard here because
 * there's no client-visible signal to guard on until that role exists for
 * real.
 */
export function AdminBilling() {
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [revenue, setRevenue] = useState<AdminRevenue | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [contracts, setContracts] = useState<EnterpriseContract[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const [rev, plansRes, couponsRes, contractsRes] = await Promise.all([
        api.getAdminRevenue(),
        api.getAdminPlans(),
        api.getAdminCoupons(),
        api.getAdminEnterpriseContracts(),
      ]);
      setRevenue(rev);
      setPlans(plansRes.items);
      setCoupons(couponsRes.items);
      setContracts(contractsRes.items);
    } catch (err) {
      // The dedicated "Restricted" full-page view (below) is specifically
      // for a 403 -- everything else routes through the shared friendly-
      // message helper (src/lib/api.ts) instead of a raw toast string.
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else toast(friendlyErrorMessage(err, 'Failed to load'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  if (forbidden) {
    return (
      <div>
        <FilterBar title="Billing Admin" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Restricted</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">This console is limited to HorizonVigil platform staff.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <FilterBar title="Billing Admin" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab revenue={revenue} loading={loading} />}
      {tab === 'Plans' && <PlansTab plans={plans} loading={loading} onChanged={load} />}
      {tab === 'Coupons' && <CouponsTab coupons={coupons} loading={loading} onChanged={load} />}
      {tab === 'Enterprise' && <EnterpriseTab contracts={contracts} loading={loading} onChanged={load} />}
    </div>
  );
}

function OverviewTab({ revenue, loading }: { revenue: AdminRevenue | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!revenue) return <p className="text-sm text-slate-400">No data.</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="MRR" value={formatCents(revenue.mrrCents)} />
      <StatCard label="ARR" value={formatCents(revenue.arrCents)} />
      <StatCard label="Active customers" value={String(revenue.activeCustomers)} />
      <StatCard label="Trialing" value={String(revenue.trialCustomers)} />
      <StatCard label="Paid customers" value={String(revenue.paidCustomers)} />
      <StatCard label="Conversion rate" value={formatPct(revenue.conversionRate)} />
      <StatCard label="Churn (30d)" value={formatPct(revenue.churnRateLast30d)} />
      <StatCard label="Subscriptions ever" value={String(revenue.totalSubscriptionsEver)} />
    </div>
  );
}

function PlansTab({ plans, loading, onChanged }: { plans: BillingPlan[]; loading: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<BillingPlan | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleArchive(plan: BillingPlan) {
    if (!confirm(`Archive "${plan.name}"? It stays available to existing subscribers but stops appearing to new signups.`)) return;
    try {
      await api.archiveAdminPlan(plan.id);
      toast(`${plan.name} archived.`, 'success');
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to archive plan', 'error');
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await api.updateAdminPlan(editing.id, {
        name: editing.name,
        monthly_price_cents: editing.monthly_price_cents,
        annual_price_cents: editing.annual_price_cents,
        included_cloud_accounts: editing.included_cloud_accounts,
        included_users: editing.included_users,
        is_active: editing.is_active,
      });
      toast(`${editing.name} updated.`, 'success');
      setEditing(null);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save plan', 'error');
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<BillingPlan>[] = [
    { key: 'name', header: 'Plan', render: p => <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>, sortValue: p => p.name },
    { key: 'monthly', header: 'Monthly', render: p => formatCents(p.monthly_price_cents, p.currency), sortValue: p => p.monthly_price_cents },
    { key: 'annual', header: 'Annual', render: p => formatCents(p.annual_price_cents, p.currency), sortValue: p => p.annual_price_cents },
    { key: 'accounts', header: 'Accounts', render: p => p.included_cloud_accounts === -1 ? 'Unlimited' : p.included_cloud_accounts },
    { key: 'users', header: 'Users', render: p => p.included_users === -1 ? 'Unlimited' : p.included_users },
    { key: 'status', header: 'Status', render: p => <Badge tone={p.is_active ? 'good' : 'neutral'}>{p.is_active ? 'Active' : 'Archived'}</Badge> },
    {
      key: 'actions', header: '', render: p => (
        <div className="flex gap-2">
          <button onClick={() => setEditing(p)} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">Edit</button>
          {p.is_active && <button onClick={() => handleArchive(p)} className="text-xs font-medium text-red-500 hover:underline">Archive</button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable columns={columns} rows={plans} rowKey={p => p.id} emptyMessage={loading ? 'Loading…' : 'No plans.'} />
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleSave} className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Edit {editing.name}</div>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Name
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Monthly price (cents)
              <input type="number" min={0} value={editing.monthly_price_cents} onChange={e => setEditing({ ...editing, monthly_price_cents: Number(e.target.value) })} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Annual price (cents)
              <input type="number" min={0} value={editing.annual_price_cents} onChange={e => setEditing({ ...editing, annual_price_cents: Number(e.target.value) })} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Included cloud accounts (-1 = unlimited)
              <input type="number" value={editing.included_cloud_accounts} onChange={e => setEditing({ ...editing, included_cloud_accounts: Number(e.target.value) })} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Included users (-1 = unlimited)
              <input type="number" value={editing.included_users} onChange={e => setEditing({ ...editing, included_users: Number(e.target.value) })} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
            </label>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setEditing(null)} className="flex-1 text-xs font-medium py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 text-xs font-semibold py-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function CouponsTab({ coupons, loading, onChanged }: { coupons: AdminCoupon[]; loading: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [maxRedemptions, setMaxRedemptions] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createAdminCoupon({
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: Number(discountValue),
        max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
      });
      toast(`Coupon ${code.toUpperCase()} created.`, 'success');
      setCode(''); setDiscountValue('10'); setMaxRedemptions('');
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create coupon', 'error');
    } finally {
      setCreating(false);
    }
  }

  const columns: Column<AdminCoupon>[] = [
    { key: 'code', header: 'Code', render: c => <span className="font-mono font-medium text-slate-900 dark:text-white">{c.code}</span>, sortValue: c => c.code },
    { key: 'discount', header: 'Discount', render: c => c.discount_type === 'percent' ? `${c.discount_value}%` : formatCents(c.discount_value, c.currency ?? 'usd') },
    { key: 'redeemed', header: 'Redeemed', render: c => `${c.times_redeemed}${c.max_redemptions != null ? ` / ${c.max_redemptions}` : ''}` },
    { key: 'valid_until', header: 'Valid until', render: c => c.valid_until ? new Date(c.valid_until).toLocaleDateString() : 'No expiry' },
    { key: 'status', header: 'Status', render: c => <Badge tone={c.is_active ? 'good' : 'neutral'}>{c.is_active ? 'Active' : 'Inactive'}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Code
          <input required value={code} onChange={e => setCode(e.target.value)} placeholder="LAUNCH20" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white w-32" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Type
          <select value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'fixed')} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white">
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount (cents)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Value
          <input required type="number" min={0} value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white w-24" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Max redemptions
          <input type="number" min={1} value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} placeholder="Unlimited" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white w-28" />
        </label>
        <button type="submit" disabled={creating} className="text-xs font-semibold px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white">{creating ? 'Creating…' : 'Create coupon'}</button>
      </form>
      <DataTable columns={columns} rows={coupons} rowKey={c => c.id} emptyMessage={loading ? 'Loading…' : 'No coupons yet.'} />
    </div>
  );
}

function EnterpriseTab({ contracts, loading, onChanged }: { contracts: EnterpriseContract[]; loading: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [annualValue, setAnnualValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createAdminEnterpriseContract({
        org_id: orgId.trim(),
        contract_number: contractNumber.trim(),
        annual_value_cents: Math.round(Number(annualValue) * 100),
        start_date: startDate,
        end_date: endDate,
      });
      toast(`Contract ${contractNumber} created.`, 'success');
      setOrgId(''); setContractNumber(''); setAnnualValue(''); setStartDate(''); setEndDate('');
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create contract', 'error');
    } finally {
      setCreating(false);
    }
  }

  const columns: Column<EnterpriseContract>[] = [
    { key: 'contract_number', header: 'Contract #', render: c => <span className="font-mono text-slate-900 dark:text-white">{c.contract_number}</span> },
    { key: 'org_id', header: 'Org ID', render: c => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{c.org_id}</span> },
    { key: 'value', header: 'Annual value', render: c => formatCents(c.annual_value_cents), sortValue: c => c.annual_value_cents },
    { key: 'period', header: 'Term', render: c => `${new Date(c.start_date).toLocaleDateString()} – ${new Date(c.end_date).toLocaleDateString()}` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">Manually recorded enterprise deals — these don't flow through Stripe checkout; billing is handled off-platform per contract.</p>
      <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Org ID
          <input required value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="uuid" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white w-48 font-mono" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Contract #
          <input required value={contractNumber} onChange={e => setContractNumber(e.target.value)} placeholder="ENT-2026-001" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white w-36" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Annual value ($)
          <input required type="number" min={0} value={annualValue} onChange={e => setAnnualValue(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Start date
          <input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          End date
          <input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
        </label>
        <button type="submit" disabled={creating} className="text-xs font-semibold px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white">{creating ? 'Creating…' : 'Record contract'}</button>
      </form>
      <DataTable columns={columns} rows={contracts} rowKey={c => c.id} emptyMessage={loading ? 'Loading…' : 'No enterprise contracts yet.'} />
    </div>
  );
}
