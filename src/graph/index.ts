// Single entry point for Graph access — real client, or the in-memory mock
// tenant when VITE_GRAPH_MOCK=1. Everything else imports `graph` from here and
// never has to know which one it's talking to.

import { isMockMode } from '../auth/msal';
import { graphApi } from './api';
import { mockGraphApi, installMockGraphControls } from './mock/mockGraph';
import type { GraphApi } from './types';

export const graph: GraphApi = isMockMode ? mockGraphApi : graphApi;

if (isMockMode) installMockGraphControls();

export * from './types';
