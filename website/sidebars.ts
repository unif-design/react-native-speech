import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';
const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'quick-start',
    'native-setup',
    {
      type: 'category',
      label: 'API',
      items: ['api/credentials', 'api/realtime', 'api/capture', 'api/input'],
    },
    'development',
  ],
};
export default sidebars;
