import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  /**
   * Split the vendor libraries out of the application chunk.
   *
   * The build emitted a single 1.65 MB JavaScript file, so every visitor
   * downloaded the whole application — all 41 pages plus every dependency —
   * before the first screen could render, and any change to any source file
   * invalidated the entire download for returning users.
   *
   * These four groups change on a completely different cadence from the app:
   * React and the router move a few times a year, the app moves daily. Giving
   * them their own content-hashed chunks means a normal deploy no longer
   * expires them, so returning visitors re-download only what actually
   * changed.
   *
   * This is a packaging change only — no module is loaded that was not loaded
   * before, and nothing here defers anything. Route-level code splitting
   * (React.lazy per page) is the larger win and is a separate change, because
   * it alters when components mount rather than only how they are grouped.
   */
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-grid': ['react-grid-layout'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/users': { target: 'https://admin-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/organization-management': { target: 'https://admin-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/settings': { target: 'https://admin-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/scim': { target: 'https://admin-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/overview': { target: 'https://reports-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/reports': { target: 'https://reports-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/custom-dashboards': { target: 'https://reports-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/aws-accounts': { target: 'https://connector-aws-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/gcp-accounts': { target: 'https://connector-gcp-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/azure-accounts': { target: 'https://connector-azure-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/resources': { target: 'https://resources-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/containers': { target: 'https://resources-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/cost-management': { target: 'https://cost-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/cost-optimization': { target: 'https://cost-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/cost': { target: 'https://cost-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/vulnerability-management': { target: 'https://security-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/security': { target: 'https://security-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/monitoring': { target: 'https://observability-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/alerts': { target: 'https://observability-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/observability': { target: 'https://observability-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/automation': { target: 'https://automation-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/billing': { target: 'https://billing-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/ai-copilot': { target: 'https://cloudops-ai-gateway-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/ai': { target: 'https://cloudops-ai-gateway-153395452624.us-central1.run.app', changeOrigin: true },
      '/api/incidents': { target: 'https://incidents-153395452624.us-central1.run.app', changeOrigin: true },
    },
  },
});
