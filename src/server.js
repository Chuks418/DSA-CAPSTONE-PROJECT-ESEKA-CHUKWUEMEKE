
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
import { createMaintenanceJob } from './jobs/maintenance.js';
import { createWaitlistService } from './services/waitlistService.js';

export function startServer(port = PORT) {
  const db = createDatabase();

  const repository = createSqliteRepository(db);
  const paymentGateway = createMockPaymentGateway();

    const eventService = createEventService(repository);
  const waitlistService = createWaitlistService(repository);

  const bookingService = createBookingService(
    repository,
    paymentGateway,
    {
      onSeatsReleased: async (tierId) => {
        await waitlistService.offerAvailableSeats({ tierId });
      },
    },
  );
  const authService = createAuthService(repository);
  const runMaintenance = createMaintenanceJob(repository);

    runMaintenance().catch((error) => {
    console.error('Initial booking maintenance failed:', error);
  });
const maintenanceInterval = setInterval(() => {
  runMaintenance().catch((error) => {
    console.error('Booking maintenance failed:', error);
  });
}, 60_000);

    const router = createApiRouter(
    eventService,
    bookingService,
    authService,
    repository,
    waitlistService,
  );

  const server = createAppServer({ router });

  server.on('close', () => {
  clearInterval(maintenanceInterval);
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
