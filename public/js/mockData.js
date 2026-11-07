const events = [
  {
    id: 'event-001',
    title: 'Benin Tech and Innovation Summit',
    city: 'Benin City',
    venue: 'Edo Innovation Hub',
    startsAt: '2027-03-20T09:00:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 'tier-001',
        eventId: 'event-001',
        name: 'Regular',
        priceCents: 250000,
        capacity: 100,
        sold: 35,
      },
      {
        id: 'tier-002',
        eventId: 'event-001',
        name: 'VIP',
        priceCents: 500000,
        capacity: 30,
        sold: 30,
      },
    ],
  },
  {
    id: 'event-002',
    title: 'Lagos Creative Business Conference',
    city: 'Lagos',
    venue: 'Landmark Centre',
    startsAt: '2027-04-10T10:00:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 'tier-003',
        eventId: 'event-002',
        name: 'Standard',
        priceCents: 150000,
        capacity: 200,
        sold: 75,
      },
      {
        id: 'tier-004',
        eventId: 'event-002',
        name: 'Premium',
        priceCents: 350000,
        capacity: 50,
        sold: 20,
      },
    ],
  },
  {
    id: 'event-003',
    title: 'Abuja Digital Health Forum',
    city: 'Abuja',
    venue: 'Transcorp Hilton',
    startsAt: '2027-05-15T08:30:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 'tier-005',
        eventId: 'event-003',
        name: 'General Admission',
        priceCents: 200000,
        capacity: 150,
        sold: 90,
      },
      {
        id: 'tier-006',
        eventId: 'event-003',
        name: 'Executive',
        priceCents: 600000,
        capacity: 40,
        sold: 10,
      },
    ],
  },
  {
    id: 'event-004',
    title: 'Port Harcourt Music and Arts Festival',
    city: 'Port Harcourt',
    venue: 'Yakubu Gowon Stadium',
    startsAt: '2027-06-05T14:00:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 'tier-007',
        eventId: 'event-004',
        name: 'Regular',
        priceCents: 100000,
        capacity: 300,
        sold: 300,
      },
      {
        id: 'tier-008',
        eventId: 'event-004',
        name: 'VIP',
        priceCents: 400000,
        capacity: 80,
        sold: 80,
      },
    ],
  },
  {
    id: 'event-005',
    title: 'Benin City Health and Wellness Expo',
    city: 'Benin City',
    venue: 'University of Benin Conference Centre',
    startsAt: '2027-07-18T09:00:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 'tier-009',
        eventId: 'event-005',
        name: 'Standard',
        priceCents: 50000,
        capacity: 120,
        sold: 15,
      },
      {
        id: 'tier-010',
        eventId: 'event-005',
        name: 'VIP',
        priceCents: 180000,
        capacity: 40,
        sold: 5,
      },
    ],
  },
];

function copyEvent(event) {
  return {
    ...event,
    tiers: event.tiers.map((tier) => ({ ...tier })),
  };
}

export function getMockEvents() {
  return events.map(copyEvent);
}

export function getMockEventById(eventId) {
  const event = events.find((item) => item.id === eventId);

  return event ? copyEvent(event) : null;
}

/**
 * Reserves seats in the original mock inventory.
 * Returns null if the tier does not exist or lacks capacity.
 */
export function reserveMockTierSeats(tierId, quantity) {
  const tier = events
    .flatMap((event) => event.tiers)
    .find((item) => item.id === tierId);

  if (!tier || tier.capacity - tier.sold < quantity) {
    return null;
  }

  tier.sold += quantity;

  return { ...tier };
}

/**
 * Releases previously reserved seats.
 */
export function releaseMockTierSeats(tierId, quantity) {
  const tier = events
    .flatMap((event) => event.tiers)
    .find((item) => item.id === tierId);

  if (!tier) {
    return false;
  }

  tier.sold = Math.max(0, tier.sold - quantity);

  return true;
}