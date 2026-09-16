/**
 * Cloud Accounts — Hierarchy tab (spec §25).
 *
 * Displays:
 *   1. HorizonVigil organization hierarchy:
 *      Organization → Folders → Projects → Accounts.
 *   2. Provider-native hierarchy where supported:
 *      - AWS Organizations OU tree
 *      - Azure Management Groups
 *      - GCP Organization / Folders
 *
 * The hierarchy data remains domain/API-owned. This component is responsible
 * for presentation, provider filtering, navigation, loading/error states and
 * accessible tree interaction.
 */
import {
  useCallback,
  useId,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '../Badge';
import { Icon } from '../icons';
import { CardSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import {
  api,
  friendlyErrorMessage,
  type AwsOrgHierarchyNode,
  type ProviderHierarchyNode,
} from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';
import {
  buildHierarchy,
  type HierNode,
} from '../../lib/cloudAccounts/hierarchy';
import {
  ProviderChips,
  type ProviderValue,
} from './ProviderChips';

interface HierarchyPanelProps {
  rows: UnifiedAccountRow[];
  orgName: string;
  refreshToken: number;
}

interface TreeNodeProps {
  node: HierNode;
  depth: number;
  onOpenAccount: (id: string) => void;
}

interface AwsOuNodeProps {
  node: AwsOrgHierarchyNode;
  depth: number;
  onOpenAccount: (id: string) => void;
}

interface GenericNodeProps {
  node: ProviderHierarchyNode;
  depth: number;
  onOpenAccount: (id: string) => void;
}


const MAX_TREE_DEPTH_PADDING = 64;

function isProviderValue(
  value: unknown,
): value is ProviderValue {
  return (
    value === 'aws' ||
    value === 'azure' ||
    value === 'gcp'
  );
}

function normalizeText(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();

  return normalized || fallback;
}

function normalizeNonNegativeInteger(
  value: unknown,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return Math.floor(value);
}

function getDepthPadding(depth: number): number {
  const safeDepth = Number.isFinite(depth)
    ? Math.max(0, Math.floor(depth))
    : 0;

  return Math.min(
    safeDepth * 16 + 4,
    MAX_TREE_DEPTH_PADDING + 4,
  );
}

function getAccountPadding(depth: number): number {
  const safeDepth = Number.isFinite(depth)
    ? Math.max(0, Math.floor(depth))
    : 0;

  return Math.min(
    (safeDepth + 1) * 16 + 22,
    MAX_TREE_DEPTH_PADDING + 22,
  );
}

function getTreeNodeIcon(
  type: string,
): 'organization' | 'folder' | 'inbox' | 'box' {
  if (type === 'org') {
    return 'organization';
  }

  if (type === 'folder') {
    return 'folder';
  }

  if (type === 'unassigned') {
    return 'inbox';
  }

  return 'box';
}

function getGenericNodeIcon(
  type: string,
): 'organization' | 'folder' | 'box' {
  if (type === 'org') {
    return 'organization';
  }

  if (
    type === 'group' ||
    type === 'folder'
  ) {
    return 'folder';
  }

  return 'box';
}

function providerLabel(
  provider: ProviderValue,
): string {
  return provider.toUpperCase();
}

function accountStatusClass(
  status: unknown,
): string {
  if (status === 'connected') {
    return 'bg-emerald-500';
  }

  if (
    status === 'error' ||
    status === 'failed'
  ) {
    return 'bg-red-500';
  }

  return 'bg-slate-400';
}

function connectionStatusClass(
  connected: boolean,
): string {
  return connected
    ? 'bg-emerald-500'
    : 'bg-slate-300 dark:bg-slate-600';
}

function safeNavigationId(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function TreeNode({
  node,
  depth,
  onOpenAccount,
}: TreeNodeProps) {
  const [open, setOpen] = useState(
    depth < 2,
  );

  const nodeId = useId();

  const children = Array.isArray(
    node.children,
  )
    ? node.children
    : [];

  const accounts = Array.isArray(
    node.accounts,
  )
    ? node.accounts
    : [];

  const hasChildren =
    children.length > 0 ||
    accounts.length > 0;

  const accountTotal =
    normalizeNonNegativeInteger(
      node.accountTotal,
    );

  const nodeName = normalizeText(
    node.name,
    'Unnamed group',
  );

  const icon = getTreeNodeIcon(
    node.type,
  );

  const childrenId = `${nodeId}-children`;

  const toggle = () => {
    if (hasChildren) {
      setOpen((current) => !current);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={
          hasChildren ? open : undefined
        }
        aria-controls={
          hasChildren
            ? childrenId
            : undefined
        }
        aria-label={
          hasChildren
            ? `${open ? 'Collapse' : 'Expand'} ${nodeName}`
            : nodeName
        }
        disabled={!hasChildren}
        className={[
          'flex w-full items-center gap-1.5',
          'rounded py-1.5 text-left',
          'hover:bg-slate-50',
          'dark:hover:bg-slate-800/50',
          'focus:outline-none',
          'focus-visible:ring-2',
          'focus-visible:ring-brand-500',
          'disabled:cursor-default',
          'disabled:hover:bg-transparent',
        ].join(' ')}
        style={{
          paddingLeft: getDepthPadding(
            depth,
          ),
        }}
      >
        {hasChildren ? (
          <Icon
            name={
              open
                ? 'chevron-down'
                : 'chevron-right'
            }
            size={13}
            className="shrink-0 text-slate-400"
            aria-hidden="true"
          />
        ) : (
          <span
            aria-hidden="true"
            className="w-[13px] shrink-0"
          />
        )}

        <Icon
          name={icon}
          size={13}
          className="shrink-0 text-slate-400"
          aria-hidden="true"
        />

        <span
          className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-200"
          title={nodeName}
        >
          {nodeName}
        </span>

        <span className="shrink-0 text-xs text-slate-400">
          {accountTotal} account
          {accountTotal === 1 ? '' : 's'}
        </span>
      </button>

      {open && hasChildren ? (
        <div id={childrenId}>
          {children.map(
            (child, index) => (
              <TreeNode
                key={`${child.id}-${index}`}
                node={child}
                depth={depth + 1}
                onOpenAccount={
                  onOpenAccount
                }
              />
            ),
          )}

          {accounts.map(
            (account, index) => {
              const accountId =
                safeNavigationId(
                  account.id,
                );

              const accountName =
                normalizeText(
                  account.name,
                  accountId ??
                    'Unnamed environment',
                );

              const environment =
                normalizeText(
                  account.environment,
                  '',
                );

              const provider =
                isProviderValue(
                  account.provider,
                )
                  ? account.provider
                  : null;

              const clickable =
                Boolean(accountId);

              return (
                <button
                  key={`${account.id}-${index}`}
                  type="button"
                  onClick={() => {
                    if (accountId) {
                      onOpenAccount(
                        accountId,
                      );
                    }
                  }}
                  disabled={!clickable}
                  aria-label={
                    clickable
                      ? `Open ${accountName}`
                      : `${accountName}. Environment identifier unavailable`
                  }
                  className={[
                    'flex w-full items-center gap-1.5',
                    'rounded py-1 text-left',
                    'hover:bg-slate-50',
                    'dark:hover:bg-slate-800/50',
                    'focus:outline-none',
                    'focus-visible:ring-2',
                    'focus-visible:ring-brand-500',
                    'disabled:cursor-default',
                    'disabled:hover:bg-transparent',
                  ].join(' ')}
                  style={{
                    paddingLeft:
                      getAccountPadding(
                        depth,
                      ),
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      accountStatusClass(
                        account.status,
                      ),
                    ].join(' ')}
                  />

                  <span
                    className="min-w-0 truncate text-xs text-slate-600 dark:text-slate-300"
                    title={accountName}
                  >
                    {accountName}
                  </span>

                  {provider ? (
                    <Badge tone="neutral">
                      {providerLabel(
                        provider,
                      )}
                    </Badge>
                  ) : null}

                  {environment ? (
                    <span
                      className="min-w-0 truncate text-[11px] text-slate-400"
                      title={environment}
                    >
                      {environment}
                    </span>
                  ) : null}
                </button>
              );
            },
          )}
        </div>
      ) : null}
    </div>
  );
}

function AwsOuNode({
  node,
  depth,
  onOpenAccount,
}: AwsOuNodeProps) {
  const [open, setOpen] = useState(
    depth < 2,
  );

  const nodeId = useId();

  const children = Array.isArray(
    node.children,
  )
    ? node.children
    : [];

  const accounts = Array.isArray(
    node.accounts,
  )
    ? node.accounts
    : [];

  const hasChildren =
    children.length > 0 ||
    accounts.length > 0;

  const nodeName = normalizeText(
    node.name,
    'Unnamed organizational unit',
  );

  const childrenId = `${nodeId}-children`;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) {
            setOpen((current) => !current);
          }
        }}
        aria-expanded={
          hasChildren ? open : undefined
        }
        aria-controls={
          hasChildren
            ? childrenId
            : undefined
        }
        aria-label={
          hasChildren
            ? `${open ? 'Collapse' : 'Expand'} ${nodeName}`
            : nodeName
        }
        disabled={!hasChildren}
        className={[
          'flex w-full items-center gap-1.5',
          'rounded py-1.5 text-left',
          'hover:bg-slate-50',
          'dark:hover:bg-slate-800/50',
          'focus:outline-none',
          'focus-visible:ring-2',
          'focus-visible:ring-brand-500',
          'disabled:cursor-default',
          'disabled:hover:bg-transparent',
        ].join(' ')}
        style={{
          paddingLeft: getDepthPadding(
            depth,
          ),
        }}
      >
        {hasChildren ? (
          <Icon
            name={
              open
                ? 'chevron-down'
                : 'chevron-right'
            }
            size={13}
            className="shrink-0 text-slate-400"
            aria-hidden="true"
          />
        ) : (
          <span
            aria-hidden="true"
            className="w-[13px] shrink-0"
          />
        )}

        <Icon
          name={
            node.type === 'root'
              ? 'organization'
              : 'folder'
          }
          size={13}
          className="shrink-0 text-slate-400"
          aria-hidden="true"
        />

        <span
          className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-200"
          title={nodeName}
        >
          {nodeName}
        </span>

        <span className="shrink-0 text-xs text-slate-400">
          {accounts.length} account
          {accounts.length === 1
            ? ''
            : 's'}
        </span>
      </button>

      {open && hasChildren ? (
        <div id={childrenId}>
          {children.map(
            (child, index) => (
              <AwsOuNode
                key={`${child.id}-${index}`}
                node={child}
                depth={depth + 1}
                onOpenAccount={
                  onOpenAccount
                }
              />
            ),
          )}

          {accounts.map(
            (account, index) => {
              const accountId =
                safeNavigationId(
                  account.id,
                );

              const connectionId =
                safeNavigationId(
                  account.connectionId,
                );

              const accountName =
                normalizeText(
                  account.name,
                  accountId ??
                    'Unnamed AWS account',
                );

              const clickable =
                Boolean(
                  account.connected &&
                    connectionId,
                );

              return (
                <div
                  key={`${account.id}-${index}`}
                  className="flex items-center gap-1.5 py-1"
                  style={{
                    paddingLeft:
                      getAccountPadding(
                        depth,
                      ),
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      connectionStatusClass(
                        Boolean(
                          account.connected,
                        ),
                      ),
                    ].join(' ')}
                  />

                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (connectionId) {
                          onOpenAccount(connectionId);
                        }
                      }}
                      className={[
                        'min-w-0 truncate text-xs',
                        'text-slate-600',
                        'hover:underline',
                        'dark:text-slate-300',
                        'focus:outline-none',
                        'focus-visible:ring-2',
                        'focus-visible:ring-brand-500',
                      ].join(' ')}
                      title={accountName}
                      aria-label={`Open ${accountName}`}
                    >
                      {accountName}
                    </button>
                  ) : (
                    <span
                      className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400"
                      title={accountName}
                    >
                      {accountName}
                    </span>
                  )}

                  {accountId ? (
                    <span
                      className="max-w-[160px] truncate font-mono text-[10px] text-slate-400"
                      title={accountId}
                    >
                      {accountId}
                    </span>
                  ) : null}

                  {!account.connected ? (
                    <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
                      not connected
                    </span>
                  ) : null}

                  {account.connected &&
                  !connectionId ? (
                    <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
                      connection unavailable
                    </span>
                  ) : null}
                </div>
              );
            },
          )}
        </div>
      ) : null}
    </div>
  );
}

function GenericNode({
  node,
  depth,
  onOpenAccount,
}: GenericNodeProps) {
  const [open, setOpen] = useState(
    depth < 2,
  );

  const nodeId = useId();

  const children = Array.isArray(
    node.children,
  )
    ? node.children
    : [];

  const isLeaf =
    node.type === 'subscription' ||
    node.type === 'project';

  const nodeName = normalizeText(
    node.name,
    'Unnamed resource',
  );

  const connectionId =
    safeNavigationId(
      node.connectionId,
    );

  const canOpen =
    Boolean(
      node.connected &&
        connectionId,
    );

  if (isLeaf) {
    return (
      <div
        className="flex min-w-0 items-center gap-1.5 py-1"
        style={{
          paddingLeft: getAccountPadding(
            depth,
          ),
        }}
      >
        <span
          aria-hidden="true"
          className={[
            'h-1.5 w-1.5 shrink-0 rounded-full',
            connectionStatusClass(
              Boolean(node.connected),
            ),
          ].join(' ')}
        />

        {canOpen ? (
          <button
            type="button"
            onClick={() => {
              if (connectionId) {
                onOpenAccount(connectionId);
              }
            }}
            className={[
              'min-w-0 truncate text-xs',
              'text-slate-600',
              'hover:underline',
              'dark:text-slate-300',
              'focus:outline-none',
              'focus-visible:ring-2',
              'focus-visible:ring-brand-500',
            ].join(' ')}
            title={nodeName}
            aria-label={`Open ${nodeName}`}
          >
            {nodeName}
          </button>
        ) : (
          <span
            className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400"
            title={nodeName}
          >
            {nodeName}
          </span>
        )}

        <span
          className="max-w-[160px] truncate font-mono text-[10px] text-slate-400"
          title={normalizeText(
            node.id,
            '',
          )}
        >
          {normalizeText(node.id, '—')}
        </span>

        {!node.connected ? (
          <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
            not connected
          </span>
        ) : null}

        {node.connected &&
        !connectionId ? (
          <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
            connection unavailable
          </span>
        ) : null}
      </div>
    );
  }

  const hasChildren =
    children.length > 0;

  const childrenId = `${nodeId}-children`;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) {
            setOpen((current) => !current);
          }
        }}
        aria-expanded={
          hasChildren ? open : undefined
        }
        aria-controls={
          hasChildren
            ? childrenId
            : undefined
        }
        aria-label={
          hasChildren
            ? `${open ? 'Collapse' : 'Expand'} ${nodeName}`
            : nodeName
        }
        disabled={!hasChildren}
        className={[
          'flex w-full items-center gap-1.5',
          'rounded py-1.5 text-left',
          'hover:bg-slate-50',
          'dark:hover:bg-slate-800/50',
          'focus:outline-none',
          'focus-visible:ring-2',
          'focus-visible:ring-brand-500',
          'disabled:cursor-default',
          'disabled:hover:bg-transparent',
        ].join(' ')}
        style={{
          paddingLeft: getDepthPadding(
            depth,
          ),
        }}
      >
        {hasChildren ? (
          <Icon
            name={
              open
                ? 'chevron-down'
                : 'chevron-right'
            }
            size={13}
            className="shrink-0 text-slate-400"
            aria-hidden="true"
          />
        ) : (
          <span
            aria-hidden="true"
            className="w-[13px] shrink-0"
          />
        )}

        <Icon
          name={getGenericNodeIcon(
            node.type,
          )}
          size={13}
          className="shrink-0 text-slate-400"
          aria-hidden="true"
        />

        <span
          className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-200"
          title={nodeName}
        >
          {nodeName}
        </span>
      </button>

      {open && hasChildren ? (
        <div id={childrenId}>
          {children.map(
            (child, index) => (
              <GenericNode
                key={`${child.id}-${index}`}
                node={child}
                depth={depth + 1}
                onOpenAccount={
                  onOpenAccount
                }
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={[
        'rounded-xl border p-4',
        'border-slate-200 bg-white',
        'dark:border-slate-800',
        'dark:bg-slate-900',
      ].join(' ')}
    >
      <h3
        id={titleId}
        className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300"
      >
        {title}
      </h3>

      {children}
    </section>
  );
}

function QueryError({
  message,
}: {
  message: string;
}) {
  return (
    <div
      role="alert"
      className={[
        'rounded-md border px-3 py-2',
        'border-amber-200 bg-amber-50',
        'text-xs text-amber-800',
        'dark:border-amber-900/50',
        'dark:bg-amber-950/30',
        'dark:text-amber-300',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <Icon
          name="alert-triangle"
          size={14}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />

        <span className="min-w-0 break-words">
          {message}
        </span>
      </div>
    </div>
  );
}

export function HierarchyPanel({
  rows,
  orgName,
  refreshToken,
}: HierarchyPanelProps) {
  const navigate = useNavigate();

  const [provider, setProvider] =
    useState<ProviderValue | null>(null);

  const openAccount = useCallback(
    (id: string) => {
      const normalizedId =
        safeNavigationId(id);

      if (!normalizedId) {
        return;
      }

      navigate(
        `/cloud-accounts/${encodeURIComponent(
          normalizedId,
        )}`,
      );
    },
    [navigate],
  );

  const counts = useMemo(() => {
    const result: Partial<
      Record<ProviderValue, number>
    > = {};

    for (const row of rows) {
      if (!isProviderValue(row.provider)) {
        continue;
      }

      result[row.provider] =
        (result[row.provider] ?? 0) +
        1;
    }

    return result;
  }, [rows]);

  const scopedRows = useMemo(() => {
    if (!provider) {
      return rows;
    }

    return rows.filter(
      (row) => row.provider === provider,
    );
  }, [rows, provider]);

  const hasProviderRows = useMemo(
    () => ({
      aws: rows.some(
        (row) => row.provider === 'aws',
      ),
      azure: rows.some(
        (row) => row.provider === 'azure',
      ),
      gcp: rows.some(
        (row) => row.provider === 'gcp',
      ),
    }),
    [rows],
  );

  const show = useCallback(
    (candidate: ProviderValue) =>
      provider === null ||
      provider === candidate,
    [provider],
  );

  const hier = useQuery({
    queryKey: [
      'cloud-accounts',
      'org-hierarchy',
      refreshToken,
    ],
    queryFn: () =>
      api.getHierarchyExplorer(),
    staleTime: 60_000,
    retry: false,
  });

  const awsOu = useQuery({
    queryKey: [
      'cloud-accounts',
      'aws-ou-hierarchy',
      refreshToken,
    ],
    queryFn: () =>
      api.getAwsOrgHierarchy(),
    staleTime: 60_000,
    retry: false,
    enabled:
      show('aws') &&
      hasProviderRows.aws,
  });

  const azureH = useQuery({
    queryKey: [
      'cloud-accounts',
      'azure-hierarchy',
      refreshToken,
    ],
    queryFn: () =>
      api.getAzureHierarchy(),
    staleTime: 60_000,
    retry: false,
    enabled:
      show('azure') &&
      hasProviderRows.azure,
  });

  const gcpH = useQuery({
    queryKey: [
      'cloud-accounts',
      'gcp-hierarchy',
      refreshToken,
    ],
    queryFn: () =>
      api.getGcpHierarchy(),
    staleTime: 60_000,
    retry: false,
    enabled:
      show('gcp') &&
      hasProviderRows.gcp,
  });

  const tree = useMemo(
    () =>
      buildHierarchy(
        normalizeText(
          orgName,
          'Organization',
        ),
        hier.data ?? null,
        scopedRows,
      ),
    [
      orgName,
      hier.data,
      scopedRows,
    ],
  );

  const treeIsEmpty =
    tree.accountTotal === 0 &&
    tree.children.length === 0 &&
    tree.accounts.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ProviderChips
        value={provider}
        onChange={setProvider}
        counts={counts}
      />

      {/* HorizonVigil hierarchy */}
      <SectionCard title="Organization → Folders → Projects → Accounts">
        {hier.isLoading ? (
          <div
            aria-label="Loading organization hierarchy"
            aria-busy="true"
          >
            <CardSkeleton lines={5} />
          </div>
        ) : hier.isError ? (
          <QueryError
            message={`Couldn't load the organization hierarchy: ${friendlyErrorMessage(
              hier.error,
            )}`}
          />
        ) : treeIsEmpty ? (
          <EmptyState
            icon="folder"
            title="Nothing to show yet"
            description="Connect accounts and set up folders or projects under Organization Management."
          />
        ) : (
          <div
            aria-label="Organization hierarchy"
            aria-busy={hier.isFetching}
          >
            <TreeNode
              node={tree}
              depth={0}
              onOpenAccount={
                openAccount
              }
            />
          </div>
        )}
      </SectionCard>

      {/* AWS */}
      {show('aws') &&
      hasProviderRows.aws ? (
        <SectionCard title="AWS Organizations (OU tree)">
          {awsOu.isLoading ? (
            <div
              aria-label="Loading AWS Organizations hierarchy"
              aria-busy="true"
            >
              <CardSkeleton lines={4} />
            </div>
          ) : awsOu.isError ? (
            <QueryError
              message={`Couldn't load the AWS Organizations hierarchy: ${friendlyErrorMessage(
                awsOu.error,
              )}`}
            />
          ) : awsOu.data?.mode ===
            'tree' ? (
            <div
              aria-label="AWS Organizations OU hierarchy"
              aria-busy={awsOu.isFetching}
            >
              {awsOu.data.roots.map(
                (root, index) => (
                  <AwsOuNode
                    key={`${root.id}-${index}`}
                    node={root}
                    depth={0}
                    onOpenAccount={
                      openAccount
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs leading-5 text-slate-400">
                No live OU tree is
                available. Connect an AWS
                Organizations management
                connection and provide it to
                this integration.
              </p>
            </div>
          )}
        </SectionCard>
      ) : null}

      {/* Azure */}
      {show('azure') &&
      hasProviderRows.azure ? (
        <SectionCard title="Azure Management Groups">
          {azureH.isLoading ? (
            <div
              aria-label="Loading Azure hierarchy"
              aria-busy="true"
            >
              <CardSkeleton lines={3} />
            </div>
          ) : azureH.isError ? (
            <QueryError
              message={`Couldn't load the Azure management hierarchy: ${friendlyErrorMessage(
                azureH.error,
              )}`}
            />
          ) : azureH.data?.mode ===
            'tree' ? (
            <div
              aria-label="Azure management group hierarchy"
              aria-busy={azureH.isFetching}
            >
              {azureH.data.roots.map(
                (root, index) => (
                  <GenericNode
                    key={`${root.id}-${index}`}
                    node={root}
                    depth={0}
                    onOpenAccount={
                      openAccount
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <p className="text-xs leading-5 text-slate-400">
              Management-group read access
              is not available, so HorizonVigil
              cannot display the full Azure
              hierarchy.
            </p>
          )}
        </SectionCard>
      ) : null}

      {/* GCP */}
      {show('gcp') &&
      hasProviderRows.gcp ? (
        <SectionCard title="GCP Organization & Folders">
          {gcpH.isLoading ? (
            <div
              aria-label="Loading GCP hierarchy"
              aria-busy="true"
            >
              <CardSkeleton lines={3} />
            </div>
          ) : gcpH.isError ? (
            <QueryError
              message={`Couldn't load the GCP hierarchy: ${friendlyErrorMessage(
                gcpH.error,
              )}`}
            />
          ) : gcpH.data?.mode ===
            'tree' ? (
            <div
              aria-label="GCP organization and folder hierarchy"
              aria-busy={gcpH.isFetching}
            >
              {gcpH.data.roots.map(
                (root, index) => (
                  <GenericNode
                    key={`${root.id}-${index}`}
                    node={root}
                    depth={0}
                    onOpenAccount={
                      openAccount
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <p className="text-xs leading-5 text-slate-400">
              Folder-hierarchy read access
              is not available, so HorizonVigil
              cannot display the full GCP
              organization hierarchy.
            </p>
          )}
        </SectionCard>
      ) : null}

      {/* Explicit empty state for a provider filter with no matching rows. */}
      {provider &&
      scopedRows.length === 0 ? (
        <EmptyState
          icon="cloud"
          title={`No ${providerLabel(
            provider,
          )} environments`}
          description={`There are no connected ${providerLabel(
            provider,
          )} environments in the current account scope.`}
        />
      ) : null}
    </div>
  );
}
