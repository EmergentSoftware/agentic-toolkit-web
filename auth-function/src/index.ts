import { app } from '@azure/functions';

import { exchangeHandler } from './exchange.js';
import { healthHandler } from './health.js';

app.http('exchange', {
  authLevel: 'anonymous',
  handler: exchangeHandler,
  methods: ['POST', 'OPTIONS'],
  route: 'auth/exchange',
});

app.http('health', {
  authLevel: 'anonymous',
  handler: healthHandler,
  methods: ['GET'],
  route: 'health',
});
