import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
