import { pathToFileURL } from 'node:url';
import { createAppServer } from './http/app.js';
import { createApiRouter } from './http/routes.js';
import { createMemoryRepository } from './repositories/memory.js';
import { createEventService } from './services/eventService.js';
import { createBookingService } from './services/bookingService.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';
import { PORT } from './config.js';

export function startServer(port = PORT) {
  const repository = createMemoryRepository();
  const paymentGateway = createMockPaymentGateway();

  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, paymentGateway);

  const router = createApiRouter(eventService, bookingService);
  const server = createAppServer({ router });

  server.listen(port, () => {
    console.log(`Event ticketing server listening on port ${server.address().port}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}