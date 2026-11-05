
# Build 4: REST API Examples

The API runs locally on port 3000 by default.

Start the server:

```bash
npm start
```

All examples use `curl.exe` and JSON request bodies.

The `x-user-id` header identifies the caller. This is a temporary identity mechanism for Build 4; authentication will be introduced in Build 7.

## 1. Health check

```bash
curl.exe http://localhost:3000/health
```

## 2. Create an event

```bash
curl.exe -i -X POST http://localhost:3000/api/events ^
  -H "Content-Type: application/json" ^
  -H "x-user-id: organizer-1" ^
  -d "{\"title\":\"Lagos Tech Meetup\",\"city\":\"Lagos\",\"venue\":\"Victoria Island\",\"startsAt\":\"2027-06-15T10:00:00.000Z\"}"
```

The event is created as a draft.

Save the returned event `id` for the next requests.

## 3. Add a ticket tier

Replace `EVENT_ID` with the event ID returned above.

```bash
curl.exe -i -X POST http://localhost:3000/api/events/EVENT_ID/tiers ^
  -H "Content-Type: application/json" ^
  -H "x-user-id: organizer-1" ^
  -d "{\"name\":\"Regular\",\"priceCents\":500000,\"capacity\":100}"
```

Save the returned tier `id`.

Prices are expressed in whole cents.

## 4. Publish an event

```bash
curl.exe -i -X POST http://localhost:3000/api/events/EVENT_ID/publish ^
  -H "x-user-id: organizer-1"
```

An event must have at least one ticket tier before it can be published.

## 5. Unpublish an event

```bash
curl.exe -i -X POST http://localhost:3000/api/events/EVENT_ID/unpublish ^
  -H "x-user-id: organizer-1"
```

Unpublishing returns the event to draft status.

## 6. Search published events

```bash
curl.exe "http://localhost:3000/api/events?q=tech&city=Lagos"
```

Supported query parameters:

| Parameter | Description |
|---|---|
| `q` | Searches event title and venue |
| `city` | Filters by city |
| `from` | Start date, inclusive |
| `to` | End date, inclusive |
| `maxPriceCents` | Maximum ticket price |
| `onlyAvailable` | Set to true or false |
| `sortBy` | `date`, `price`, or `availability` |

Example with sorting and price filtering:

```bash
curl.exe "http://localhost:3000/api/events?city=Lagos&maxPriceCents=500000&sortBy=price"
```

## 7. Create a booking

Replace `TIER_ID` with the ticket tier ID returned earlier.

```bash
curl.exe -i -X POST http://localhost:3000/api/bookings ^
  -H "Content-Type: application/json" ^
  -H "x-user-id: attendee-1" ^
  -d "{\"tierId\":\"TIER_ID\",\"quantity\":2}"
```

A successful booking starts in `pending` status.

Save the returned booking `reference`.

## 8. Pay for a booking

Replace `BOOKING_REFERENCE` with the returned booking reference.

```bash
curl.exe -i -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay ^
  -H "Content-Type: application/json" ^
  -H "x-user-id: attendee-1" ^
  -d "{\"outcome\":\"success\"}"
```

The mock payment gateway returns a successful payment result and changes the booking status to `paid`.

## 9. Simulate a declined payment

```bash
curl.exe -i -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay ^
  -H "Content-Type: application/json" ^
  -H "x-user-id: attendee-1" ^
  -d "{\"outcome\":\"declined\"}"
```

A declined payment returns `PAYMENT_DECLINED`. The booking remains pending and can be retried.

The mock gateway does not receive or process card numbers.

## 10. Cancel an unpaid booking

```bash
curl.exe -i -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/cancel ^
  -H "x-user-id: attendee-1"
```

Only pending bookings can be cancelled. Cancelled bookings release their reserved seats.

## Error responses

All API errors use the same JSON structure:

```json
{
  "error": {
    "code": "SOLD_OUT",
    "message": "Not enough tickets are available"
  }
}
```

Common HTTP status mappings:

| HTTP status | Error code / meaning |
|---|---|
| 400 | Validation or malformed JSON |
| 402 | Payment declined |
| 403 | Forbidden |
| 404 | Resource or route not found |
| 409 | Sold out, invalid state or transition |
| 500 | Unexpected server error |

## Important notes

- Data is stored in memory and is lost when the server restarts.
- No real payment is processed.
- The `x-user-id` header is a temporary identity mechanism, not authentication.
- Booking quantities must be whole numbers from 1 to 10.
- Monetary values are stored as whole cents.
