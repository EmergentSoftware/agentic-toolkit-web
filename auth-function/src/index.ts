import { app } from '@azure/functions';

import { exchangeHandler } from './exchange.js';

app.http('exchange', {
  authLevel: 'anonymous',
  handler: exchangeHandler,
  methods: ['POST', 'OPTIONS'],
  route: 'auth/exchange',
});
