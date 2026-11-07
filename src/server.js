
import { pathToFileURL } from 'node:url';

import { createAppServer } from './http/app.js';
import { createApiRouter } from './http/routes.js';
import { createDatabase } from './db/connection.js';
import { createSqliteRepository } from './repositories/sqlite.js';
import { createEventService } from './services/eventService.js';
import { createBookingService } from './services/bookingService.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';
import { PORT } from './config.js';

export function startServer(port = PORT) {
  // Open the persistent SQLite database.
  const db = createDatabase();

  // Create the SQLite repository.
  const repository = createSqliteRepository(db);

  // Create the payment gateway and services.
  const paymentGateway = createMockPaymentGateway();

  const eventService = createEventService(repository);
  const bookingService = createBookingService(
    repository,
    paymentGateway,
  );

  // Create the API router and HTTP server.
  const router = createApiRouter(
    eventService,
    bookingService,
  );

  const server = createAppServer({ router });

  // Close the database when the server shuts down.
  server.on('close', () => {
    db.close();
  });

  server.listen(port, () => {
    console.log(
      `Event ticketing server listening on port ${server.address().port}`,
    );
  });

  return server;
}

// Start the server only when this file is executed directly.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer();
}
