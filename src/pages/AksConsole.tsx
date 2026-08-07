import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { RoadmapPanel } from '../components/EmptyState';

// Azure AKS support has no backend anywhere yet — no connector-azure
// service, no schema support (cloud_connections.provider doesn't even allow
// 'azure' yet), no scanner. This console exists so the multi-cloud nav
// structure is real today rather than something to retrofit later, but it
// deliberately shows nothing fake — no placeholder charts, no mocked
// clusters. See the multi-cloud K8s consoles plan, Phase 2, for what
// building this out for real requires.
export function AksConsole() {
  return (
    <div>
      <FilterBar title="Azure AKS Console" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} />
      <RoadmapPanel
        icon="◌"
        title="Azure AKS support isn't built yet"
        description="Connecting an Azure subscription and discovering AKS clusters is on the roadmap but not implemented — no Azure connector, no cluster or workload scanning exists today. This page will show real cluster/node/pod data once that's built, not before."
      />
    </div>
  );
}
