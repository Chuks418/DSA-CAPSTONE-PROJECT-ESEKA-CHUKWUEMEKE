
import { pathToFileURL } from 'node:url';

import { createAppServer } from './http/app.js';
import { createApiRouter } from './http/routes.js';
import { createDatabase } from './db/connection.js';
import { createSqliteRepository } from './repositories/sqlite.js';
import { createEventService } from './services/eventService.js';
import { createBookingService } from './services/bookingService.js';
import { createAuthService } from './services/authService.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';
import { PORT } from './config.js';

export function startServer(port = PORT) {
  const db = createDatabase();

  const repository = createSqliteRepository(db);
  const paymentGateway = createMockPaymentGateway();

  const eventService = createEventService(repository);
  const bookingService = createBookingService(
    repository,
    paymentGateway
  );
  const authService = createAuthService(repository);

  const router = createApiRouter(
    eventService,
    bookingService,
    authService,
    repository
  );

  const server = createAppServer({ router });

  server.on('close', () => {
    db.close();
  });

  server.listen(port, () => {
    console.log(
      `Event ticketing server listening on port ${server.address().port}`
    );
  });

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer();
}
