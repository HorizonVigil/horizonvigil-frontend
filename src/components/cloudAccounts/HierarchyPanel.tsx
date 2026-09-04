/**
 * Cloud Accounts — Hierarchy tab (spec §25). Two views:
 *  1. Organization → Folders → Projects → Accounts (from org-management's
 *     hierarchy explorer joined to connected accounts).
 *  2. AWS Organizations OU tree (live, when a management connection is set —
 *     Azure management groups / GCP folders are a backend follow-up).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../Badge';
import { Icon } from '../icons';
import { CardSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { api, friendlyErrorMessage, type AwsOrgHierarchyNode, type ProviderHierarchyNode } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';
import { buildHierarchy, type HierNode } from '../../lib/cloudAccounts/hierarchy';
import { ProviderChips, type ProviderValue } from './ProviderChips';

function TreeNode({ node, depth, onOpenAccount }: { node: HierNode; depth: number; onOpenAccount: (id: string) => void }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0 || node.accounts.length > 0;
  const icon = node.type === 'org' ? 'organization' : node.type === 'folder' ? 'folder' : node.type === 'unassigned' ? 'inbox' : 'box';

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 w-full text-left py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded"
        style={{ paddingLeft: depth * 16 + 4 }}>
        {hasChildren ? <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} className="text-slate-400 shrink-0" /> : <span className="w-[13px] shrink-0" />}
        <Icon name={icon} size={13} className="text-slate-400 shrink-0" />
        <span className="text-sm text-slate-700 dark:text-slate-200">{node.name}</span>
        <span className="text-xs text-slate-400">{node.accountTotal} account{node.accountTotal === 1 ? '' : 's'}</span>
      </button>
      {open && (
        <div>
          {node.children.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} onOpenAccount={onOpenAccount} />)}
          {node.accounts.map((a) => (
            <button key={a.id} type="button" onClick={() => onOpenAccount(a.id)}
              className="flex items-center gap-1.5 w-full text-left py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded"
              style={{ paddingLeft: (depth + 1) * 16 + 22 }}>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${a.status === 'connected' ? 'bg-emerald-500' : a.status === 'error' ? 'bg-red-500' : 'bg-slate-400'}`} />
              <span className="text-xs text-slate-600 dark:text-slate-300">{a.name}</span>
              <Badge tone="neutral">{a.provider.toUpperCase()}</Badge>
              <span className="text-[11px] text-slate-400">{a.environment}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AwsOuNode({ node, depth, onOpenAccount }: { node: AwsOrgHierarchyNode; depth: number; onOpenAccount: (id: string) => void }) {
  const [open, setOpen] = useState(depth < 2);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 w-full text-left py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded" style={{ paddingLeft: depth * 16 + 4 }}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} className="text-slate-400 shrink-0" />
        <Icon name={node.type === 'root' ? 'organization' : 'folder'} size={13} className="text-slate-400 shrink-0" />
        <span className="text-sm text-slate-700 dark:text-slate-200">{node.name}</span>
        <span className="text-xs text-slate-400">{node.accounts.length} account{node.accounts.length === 1 ? '' : 's'}</span>
      </button>
      {open && (
        <div>
          {node.children.map((c) => <AwsOuNode key={c.id} node={c} depth={depth + 1} onOpenAccount={onOpenAccount} />)}
          {node.accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5 py-1" style={{ paddingLeft: (depth + 1) * 16 + 22 }}>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${a.connected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
              {a.connected && a.connectionId ? (
                <button type="button" onClick={() => onOpenAccount(a.connectionId!)} className="text-xs text-slate-600 dark:text-slate-300 hover:underline">{a.name}</button>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">{a.name}</span>
              )}
              <span className="font-mono text-[10px] text-slate-400">{a.id}</span>
              {!a.connected && <span className="text-[10px] text-amber-600 dark:text-amber-400">not connected</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GenericNode({ node, depth, onOpenAccount }: { node: ProviderHierarchyNode; depth: number; onOpenAccount: (id: string) => void }) {
  const [open, setOpen] = useState(depth < 2);
  const isLeaf = node.type === 'subscription' || node.type === 'project';
  const icon = node.type === 'org' ? 'organization' : node.type === 'group' || node.type === 'folder' ? 'folder' : 'box';
  if (isLeaf) {
    return (
      <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: depth * 16 + 22 }}>
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${node.connected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
        {node.connected && node.connectionId ? (
          <button type="button" onClick={() => onOpenAccount(node.connectionId!)} className="text-xs text-slate-600 dark:text-slate-300 hover:underline">{node.name}</button>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">{node.name}</span>
        )}
        <span className="font-mono text-[10px] text-slate-400">{node.id}</span>
        {!node.connected && <span className="text-[10px] text-amber-600 dark:text-amber-400">not connected</span>}
      </div>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 w-full text-left py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded" style={{ paddingLeft: depth * 16 + 4 }}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} className="text-slate-400 shrink-0" />
        <Icon name={icon} size={13} className="text-slate-400 shrink-0" />
        <span className="text-sm text-slate-700 dark:text-slate-200">{node.name}</span>
      </button>
      {open && node.children.map((c) => <GenericNode key={c.id} node={c} depth={depth + 1} onOpenAccount={onOpenAccount} />)}
    </div>
  );
}

export function HierarchyPanel({ rows, orgName, refreshToken }: { rows: UnifiedAccountRow[]; orgName: string; refreshToken: number }) {
  const navigate = useNavigate();
  const openAccount = (id: string) => navigate(`/cloud-accounts/${id}`);
  const [provider, setProvider] = useState<ProviderValue | null>(null);

  const counts = useMemo(() => {
    const c: Partial<Record<ProviderValue, number>> = {};
    for (const r of rows) c[r.provider] = (c[r.provider] ?? 0) + 1;
    return c;
  }, [rows]);
  const scopedRows = useMemo(() => (provider ? rows.filter((r) => r.provider === provider) : rows), [rows, provider]);
  const show = (p: ProviderValue) => provider === null || provider === p;

  const hier = useQuery({
    queryKey: ['cloud-accounts', 'org-hierarchy', refreshToken],
    queryFn: () => api.getHierarchyExplorer(),
    staleTime: 60_000,
  });
  const awsOu = useQuery({
    queryKey: ['cloud-accounts', 'aws-ou-hierarchy', refreshToken],
    queryFn: () => api.getAwsOrgHierarchy(),
    staleTime: 60_000,
    retry: false,
  });
  const azureH = useQuery({
    queryKey: ['cloud-accounts', 'azure-hierarchy', refreshToken],
    queryFn: () => api.getAzureHierarchy(),
    staleTime: 60_000,
    retry: false,
    enabled: rows.some((r) => r.provider === 'azure'),
  });
  const gcpH = useQuery({
    queryKey: ['cloud-accounts', 'gcp-hierarchy', refreshToken],
    queryFn: () => api.getGcpHierarchy(),
    staleTime: 60_000,
    retry: false,
    enabled: rows.some((r) => r.provider === 'gcp'),
  });

  const tree = useMemo(() => buildHierarchy(orgName, hier.data ?? null, scopedRows), [orgName, hier.data, scopedRows]);

  return (
    <div className="flex flex-col gap-4">
      <ProviderChips value={provider} onChange={setProvider} counts={counts} />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Organization → Folders → Projects → Accounts</h3>
        {hier.isLoading ? <CardSkeleton lines={5} /> : tree.accountTotal === 0 && tree.children.length === 0 ? (
          <EmptyState icon="folder" title="Nothing to show yet" description="Connect accounts and set up folders/projects under Organization Management." />
        ) : (
          <TreeNode node={tree} depth={0} onOpenAccount={openAccount} />
        )}
      </div>

      {show('aws') && (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">AWS Organizations (OU tree)</h3>
        {awsOu.isLoading ? <CardSkeleton lines={4} /> : awsOu.isError ? (
          <p className="text-xs text-slate-400">Couldn't load: {friendlyErrorMessage(awsOu.error)}</p>
        ) : awsOu.data?.mode === 'tree' ? (
          awsOu.data.roots.map((r) => <AwsOuNode key={r.id} node={r} depth={0} onOpenAccount={openAccount} />)
        ) : (
          <p className="text-xs text-slate-400">No live OU tree — connect your AWS Organizations management account and pass it to this view.</p>
        )}
      </div>
      )}

      {show('azure') && rows.some((r) => r.provider === 'azure') && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Azure Management Groups</h3>
          {azureH.isLoading ? <CardSkeleton lines={3} /> : azureH.isError ? (
            <p className="text-xs text-slate-400">Couldn't load: {friendlyErrorMessage(azureH.error)}</p>
          ) : azureH.data?.mode === 'tree' ? (
            azureH.data.roots.map((r) => <GenericNode key={r.id} node={r} depth={0} onOpenAccount={openAccount} />)
          ) : (
            <p className="text-xs text-slate-400">Management-group read access isn't granted — showing subscriptions flat. Grant the service principal Reader on the tenant root management group for the full tree.</p>
          )}
        </div>
      )}

      {show('gcp') && rows.some((r) => r.provider === 'gcp') && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">GCP Organization &amp; Folders</h3>
          {gcpH.isLoading ? <CardSkeleton lines={3} /> : gcpH.isError ? (
            <p className="text-xs text-slate-400">Couldn't load: {friendlyErrorMessage(gcpH.error)}</p>
          ) : gcpH.data?.mode === 'tree' ? (
            gcpH.data.roots.map((r) => <GenericNode key={r.id} node={r} depth={0} onOpenAccount={openAccount} />)
          ) : (
            <p className="text-xs text-slate-400">Folder-hierarchy read access isn't granted — showing projects flat. Grant the service account <code>resourcemanager.folders.list</code> at the org level for the full tree.</p>
          )}
        </div>
      )}
    </div>
  );
}
