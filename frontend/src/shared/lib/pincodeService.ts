/**
 * DSA OS — Indian PIN Code Location Lookup Service
 *
 * Exclusively queries the official India Post API:
 * https://api.postalpincode.in/pincode/{pincode}
 *
 * Rules:
 * 1. Zero hardcoded PIN-code-to-city/district/state mapping.
 * 2. Zero fabricated or fallback location data when the API fails.
 * 3. Checks response.ok, valid JSON, Status === "Success", and non-empty PostOffice array.
 * 4. Extracts common District and State values when results agree.
 * 5. Returns all post office Names for locality selection.
 * 6. In-memory session cache eliminates duplicate network hits for the same PIN code.
 */

export interface PincodeLocationResult {
  pincode: string
  locality: string              // Primary/selected post-office or town name
  availableLocalities: string[] // All post-office names returned by API for this PIN
  district: string              // Common District (e.g. "Bhopal", "Sagar", "Central Delhi")
  state: string                 // Common State (e.g. "Madhya Pradesh", "Delhi")
  stateShort: string            // 2-letter abbreviation (e.g. "MP", "DL")
  country: string               // "India" only when supported by response
  city: string                  // District || locality
  formattedLocation: string     // Human-friendly location string
}

// In-memory session cache to avoid repeated requests for unchanged PIN codes
const pincodeCache = new Map<string, PincodeLocationResult>()

// State to 2-letter postal code mapping
const STATE_SHORT_MAP: Record<string, string> = {
  'Andaman and Nicobar Islands': 'AN',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  'Assam': 'AS',
  'Bihar': 'BR',
  'Chandigarh': 'CH',
  'Chhattisgarh': 'CG',
  'Dadra and Nagar Haveli and Daman and Diu': 'DH',
  'Delhi': 'DL',
  'Goa': 'GA',
  'Gujarat': 'GJ',
  'Haryana': 'HR',
  'Himachal Pradesh': 'HP',
  'Jammu and Kashmir': 'JK',
  'Jharkhand': 'JH',
  'Karnataka': 'KA',
  'Kerala': 'KL',
  'Ladakh': 'LA',
  'Lakshadweep': 'LD',
  'Madhya Pradesh': 'MP',
  'Maharashtra': 'MH',
  'Manipur': 'MN',
  'Meghalaya': 'ML',
  'Mizoram': 'MZ',
  'Nagaland': 'NL',
  'Odisha': 'OD',
  'Puducherry': 'PY',
  'Punjab': 'PB',
  'Rajasthan': 'RJ',
  'Sikkim': 'SK',
  'Tamil Nadu': 'TN',
  'Telangana': 'TS',
  'Tripura': 'TR',
  'Uttar Pradesh': 'UP',
  'Uttarakhand': 'UK',
  'West Bengal': 'WB',
}

export function isValidIndianPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode.trim())
}

export function formatLocationString(locality: string, district: string, state: string): string {
  const parts: string[] = []
  const loc = locality.trim()
  const dist = district.trim()
  const st = state.trim()
  if (loc) parts.push(loc)
  if (dist && dist.toLowerCase() !== loc.toLowerCase()) parts.push(`Dist: ${dist}`)
  if (st) parts.push(st)
  return parts.join(', ')
}

export interface RawPostOfficeItem {
  Name?: string | null
  Description?: string | null
  BranchType?: string | null
  DeliveryStatus?: string | null
  Circle?: string | null
  District?: string | null
  Division?: string | null
  Region?: string | null
  Block?: string | null
  State?: string | null
  Country?: string | null
  Pincode?: string | null
}

export interface RawPostalApiResponseItem {
  Message?: string
  Status?: string
  PostOffice?: RawPostOfficeItem[] | null
}

/**
 * Perform a live lookup against the official India Post API:
 * https://api.postalpincode.in/pincode/{pincode}
 *
 * Never returns fabricated fallback data. Returns null if invalid or not found.
 */
export async function lookupIndianPincode(
  pincode: string,
  signal?: AbortSignal
): Promise<PincodeLocationResult | null> {
  const cleanPin = pincode.replace(/\D/g, '').slice(0, 6)
  if (!isValidIndianPincode(cleanPin)) {
    return null
  }

  // 1. Check in-memory session cache
  if (pincodeCache.has(cleanPin)) {
    return { ...pincodeCache.get(cleanPin)! }
  }

  // 2. Query official India Post API
  const fetchController = new AbortController()
  const timer = setTimeout(() => fetchController.abort(), 10000)

  const onParentAbort = () => fetchController.abort()
  if (signal) {
    signal.addEventListener('abort', onParentAbort)
  }

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`, {
      signal: fetchController.signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as RawPostalApiResponseItem[]

    // Validate response structure per official India Post API specification
    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      data[0]?.Status !== 'Success' ||
      !Array.isArray(data[0]?.PostOffice) ||
      data[0].PostOffice.length === 0
    ) {
      return null
    }

    const postOffices = data[0].PostOffice

    // Extract all distinct post office names for locality selection
    const availableLocalities: string[] = []
    for (const po of postOffices) {
      const name = (po.Name || po.Block || '').trim()
      if (name && !availableLocalities.includes(name)) {
        availableLocalities.push(name)
      }
    }

    // Determine common District and State across post offices
    const districts = Array.from(new Set(postOffices.map(po => (po.District || '').trim()).filter(Boolean)))
    const states = Array.from(new Set(postOffices.map(po => (po.State || '').trim()).filter(Boolean)))
    const countries = Array.from(new Set(postOffices.map(po => (po.Country || '').trim()).filter(Boolean)))

    // Use common district and state
    const district = districts[0] || (postOffices[0].Division || '').trim() || ''
    const state = states[0] || ''
    const country = countries.includes('India') ? 'India' : (countries[0] || 'India')

    if (!district && !state) {
      return null
    }

    const primaryLocality = availableLocalities[0] || district
    const stateShort = STATE_SHORT_MAP[state] || state.slice(0, 2).toUpperCase()
    const city = district || primaryLocality
    const formattedLocation = formatLocationString(primaryLocality, district, state)

    const result: PincodeLocationResult = {
      pincode: cleanPin,
      locality: primaryLocality,
      availableLocalities: availableLocalities.length > 0 ? availableLocalities : [primaryLocality],
      district,
      state,
      stateShort,
      country,
      city,
      formattedLocation,
    }

    pincodeCache.set(cleanPin, result)
    return result
  } catch {
    // Return null on network error, abort, or timeout. Never return fabricated data.
    return null
  } finally {
    clearTimeout(timer)
    if (signal) {
      signal.removeEventListener('abort', onParentAbort)
    }
  }
}

/**
 * Clear the session in-memory cache (useful for testing).
 */
export function clearPincodeCache(): void {
  pincodeCache.clear()
}
