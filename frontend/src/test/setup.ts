/**
 * DSA OS — Vitest test setup
 * Runs before all tests.
 */
import '@testing-library/jest-dom'

// Mock India Post API in automated tests to prevent slow network timeouts (default waitFor is 1000ms)
const originalFetch = globalThis.fetch

const MOCK_POSTAL_DATA: Record<string, { name: string; district: string; state: string }> = {
  '470229': { name: 'Garhakota', district: 'Sagar', state: 'Madhya Pradesh' },
  '560001': { name: 'Bengaluru GPO', district: 'Bengaluru Urban', state: 'Karnataka' },
  '110001': { name: 'Connaught Place', district: 'Central Delhi', state: 'Delhi' },
  '302001': { name: 'Jaipur GPO', district: 'Jaipur', state: 'Rajasthan' },
  '400001': { name: 'Fort', district: 'Mumbai', state: 'Maharashtra' },
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (urlStr.includes('api.postalpincode.in/pincode/')) {
    const pin = urlStr.split('/pincode/')[1]?.slice(0, 6)
    const match = pin ? MOCK_POSTAL_DATA[pin] : null
    if (match) {
      return new Response(
        JSON.stringify([
          {
            Message: 'Number of pincode(s) found:1',
            Status: 'Success',
            PostOffice: [
              {
                Name: match.name,
                District: match.district,
                State: match.state,
                Pincode: pin,
              },
            ],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
  return originalFetch(input, init)
}
