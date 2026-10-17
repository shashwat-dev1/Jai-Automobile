/**
 * DSA OS — Indian PIN Code Location Lookup Service
 *
 * Strategy (in order):
 * 1. In-memory cache  — zero latency on repeat lookups
 * 2. Official India Post API  — https://api.postalpincode.in/pincode/{pin}
 *    Extracts: PostOffice.Name (locality), PostOffice.District, PostOffice.State
 * 3. 2-digit state prefix fallback — state + defaultCity when API is unreachable
 *
 * No hardcoded pin-code directory.  Every real lookup goes to the public API.
 */

export interface PincodeLocationResult {
  pincode: string
  locality: string          // Post-office / town name  e.g. "Garhakota"
  district: string          // District                  e.g. "Sagar"
  state: string             // State                     e.g. "Madhya Pradesh"
  stateShort: string        // 2-letter code             e.g. "MP"
  city: string              // locality || district fallback
  formattedLocation: string // "Garhakota, Dist: Sagar, Madhya Pradesh"
  source: 'cache' | 'api' | 'fallback'
}

// ─── In-memory session cache ──────────────────────────────────────────────────
const pincodeCache = new Map<string, PincodeLocationResult>()

// ─── State short codes ─────────────────────────────────────────────────────────
const STATE_SHORT: Record<string, string> = {
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

// ─── 2-digit prefix → state fallback (used only when API is unreachable) ──────
const PIN_PREFIX_STATE_MAP: Record<string, { state: string; stateShort: string; defaultCity: string; defaultDistrict: string }> = {
  '11': { state: 'Delhi',              stateShort: 'DL', defaultCity: 'Delhi',             defaultDistrict: 'Central Delhi' },
  '12': { state: 'Haryana',            stateShort: 'HR', defaultCity: 'Gurugram',          defaultDistrict: 'Gurugram' },
  '13': { state: 'Haryana',            stateShort: 'HR', defaultCity: 'Ambala',            defaultDistrict: 'Ambala' },
  '14': { state: 'Punjab',             stateShort: 'PB', defaultCity: 'Ludhiana',          defaultDistrict: 'Ludhiana' },
  '15': { state: 'Punjab',             stateShort: 'PB', defaultCity: 'Bathinda',          defaultDistrict: 'Bathinda' },
  '16': { state: 'Chandigarh',         stateShort: 'CH', defaultCity: 'Chandigarh',        defaultDistrict: 'Chandigarh' },
  '17': { state: 'Himachal Pradesh',   stateShort: 'HP', defaultCity: 'Shimla',            defaultDistrict: 'Shimla' },
  '18': { state: 'Jammu and Kashmir',  stateShort: 'JK', defaultCity: 'Jammu',             defaultDistrict: 'Jammu' },
  '19': { state: 'Jammu and Kashmir',  stateShort: 'JK', defaultCity: 'Srinagar',          defaultDistrict: 'Srinagar' },
  '20': { state: 'Uttar Pradesh',      stateShort: 'UP', defaultCity: 'Noida',             defaultDistrict: 'Gautam Buddha Nagar' },
  '21': { state: 'Uttar Pradesh',      stateShort: 'UP', defaultCity: 'Prayagraj',         defaultDistrict: 'Prayagraj' },
  '22': { state: 'Uttar Pradesh',      stateShort: 'UP', defaultCity: 'Lucknow',           defaultDistrict: 'Lucknow' },
  '23': { state: 'Uttar Pradesh',      stateShort: 'UP', defaultCity: 'Ayodhya',           defaultDistrict: 'Ayodhya' },
  '24': { state: 'Uttarakhand',        stateShort: 'UK', defaultCity: 'Dehradun',          defaultDistrict: 'Dehradun' },
  '25': { state: 'Uttar Pradesh',      stateShort: 'UP', defaultCity: 'Meerut',            defaultDistrict: 'Meerut' },
  '26': { state: 'Uttarakhand',        stateShort: 'UK', defaultCity: 'Nainital',          defaultDistrict: 'Nainital' },
  '27': { state: 'Uttar Pradesh',      stateShort: 'UP', defaultCity: 'Gorakhpur',         defaultDistrict: 'Gorakhpur' },
  '28': { state: 'Uttar Pradesh',      stateShort: 'UP', defaultCity: 'Jhansi',            defaultDistrict: 'Jhansi' },
  '30': { state: 'Rajasthan',          stateShort: 'RJ', defaultCity: 'Jaipur',            defaultDistrict: 'Jaipur' },
  '31': { state: 'Rajasthan',          stateShort: 'RJ', defaultCity: 'Udaipur',           defaultDistrict: 'Udaipur' },
  '32': { state: 'Rajasthan',          stateShort: 'RJ', defaultCity: 'Kota',              defaultDistrict: 'Kota' },
  '33': { state: 'Rajasthan',          stateShort: 'RJ', defaultCity: 'Bikaner',           defaultDistrict: 'Bikaner' },
  '34': { state: 'Rajasthan',          stateShort: 'RJ', defaultCity: 'Jodhpur',           defaultDistrict: 'Jodhpur' },
  '36': { state: 'Gujarat',            stateShort: 'GJ', defaultCity: 'Rajkot',            defaultDistrict: 'Rajkot' },
  '37': { state: 'Gujarat',            stateShort: 'GJ', defaultCity: 'Jamnagar',          defaultDistrict: 'Jamnagar' },
  '38': { state: 'Gujarat',            stateShort: 'GJ', defaultCity: 'Ahmedabad',         defaultDistrict: 'Ahmedabad' },
  '39': { state: 'Gujarat',            stateShort: 'GJ', defaultCity: 'Surat',             defaultDistrict: 'Surat' },
  '40': { state: 'Maharashtra',        stateShort: 'MH', defaultCity: 'Mumbai',            defaultDistrict: 'Mumbai' },
  '41': { state: 'Maharashtra',        stateShort: 'MH', defaultCity: 'Pune',              defaultDistrict: 'Pune' },
  '42': { state: 'Maharashtra',        stateShort: 'MH', defaultCity: 'Nashik',            defaultDistrict: 'Nashik' },
  '43': { state: 'Maharashtra',        stateShort: 'MH', defaultCity: 'Aurangabad',        defaultDistrict: 'Chhatrapati Sambhajinagar' },
  '44': { state: 'Maharashtra',        stateShort: 'MH', defaultCity: 'Nagpur',            defaultDistrict: 'Nagpur' },
  '45': { state: 'Madhya Pradesh',     stateShort: 'MP', defaultCity: 'Indore',            defaultDistrict: 'Indore' },
  '46': { state: 'Madhya Pradesh',     stateShort: 'MP', defaultCity: 'Bhopal',            defaultDistrict: 'Bhopal' },
  '47': { state: 'Madhya Pradesh',     stateShort: 'MP', defaultCity: 'Gwalior',           defaultDistrict: 'Gwalior' },
  '48': { state: 'Madhya Pradesh',     stateShort: 'MP', defaultCity: 'Jabalpur',          defaultDistrict: 'Jabalpur' },
  '49': { state: 'Chhattisgarh',       stateShort: 'CG', defaultCity: 'Raipur',            defaultDistrict: 'Raipur' },
  '50': { state: 'Telangana',          stateShort: 'TS', defaultCity: 'Hyderabad',         defaultDistrict: 'Hyderabad' },
  '51': { state: 'Andhra Pradesh',     stateShort: 'AP', defaultCity: 'Kurnool',           defaultDistrict: 'Kurnool' },
  '52': { state: 'Andhra Pradesh',     stateShort: 'AP', defaultCity: 'Vijayawada',        defaultDistrict: 'NTR' },
  '53': { state: 'Andhra Pradesh',     stateShort: 'AP', defaultCity: 'Visakhapatnam',     defaultDistrict: 'Visakhapatnam' },
  '56': { state: 'Karnataka',          stateShort: 'KA', defaultCity: 'Bengaluru',         defaultDistrict: 'Bengaluru Urban' },
  '57': { state: 'Karnataka',          stateShort: 'KA', defaultCity: 'Mangaluru',         defaultDistrict: 'Dakshina Kannada' },
  '58': { state: 'Karnataka',          stateShort: 'KA', defaultCity: 'Hubballi',          defaultDistrict: 'Dharwad' },
  '59': { state: 'Karnataka',          stateShort: 'KA', defaultCity: 'Belagavi',          defaultDistrict: 'Belagavi' },
  '60': { state: 'Tamil Nadu',         stateShort: 'TN', defaultCity: 'Chennai',           defaultDistrict: 'Chennai' },
  '61': { state: 'Tamil Nadu',         stateShort: 'TN', defaultCity: 'Thanjavur',         defaultDistrict: 'Thanjavur' },
  '62': { state: 'Tamil Nadu',         stateShort: 'TN', defaultCity: 'Madurai',           defaultDistrict: 'Madurai' },
  '63': { state: 'Tamil Nadu',         stateShort: 'TN', defaultCity: 'Salem',             defaultDistrict: 'Salem' },
  '64': { state: 'Tamil Nadu',         stateShort: 'TN', defaultCity: 'Coimbatore',        defaultDistrict: 'Coimbatore' },
  '67': { state: 'Kerala',             stateShort: 'KL', defaultCity: 'Kozhikode',         defaultDistrict: 'Kozhikode' },
  '68': { state: 'Kerala',             stateShort: 'KL', defaultCity: 'Kochi',             defaultDistrict: 'Ernakulam' },
  '69': { state: 'Kerala',             stateShort: 'KL', defaultCity: 'Thiruvananthapuram', defaultDistrict: 'Thiruvananthapuram' },
  '70': { state: 'West Bengal',        stateShort: 'WB', defaultCity: 'Kolkata',           defaultDistrict: 'Kolkata' },
  '71': { state: 'West Bengal',        stateShort: 'WB', defaultCity: 'Howrah',            defaultDistrict: 'Howrah' },
  '72': { state: 'West Bengal',        stateShort: 'WB', defaultCity: 'Midnapore',         defaultDistrict: 'Paschim Medinipur' },
  '73': { state: 'West Bengal',        stateShort: 'WB', defaultCity: 'Siliguri',          defaultDistrict: 'Darjeeling' },
  '74': { state: 'West Bengal',        stateShort: 'WB', defaultCity: 'Barasat',           defaultDistrict: 'North 24 Parganas' },
  '75': { state: 'Odisha',             stateShort: 'OD', defaultCity: 'Bhubaneswar',       defaultDistrict: 'Khurda' },
  '76': { state: 'Odisha',             stateShort: 'OD', defaultCity: 'Cuttack',           defaultDistrict: 'Cuttack' },
  '77': { state: 'Odisha',             stateShort: 'OD', defaultCity: 'Rourkela',          defaultDistrict: 'Sundargarh' },
  '78': { state: 'Assam',              stateShort: 'AS', defaultCity: 'Guwahati',          defaultDistrict: 'Kamrup Metropolitan' },
  '80': { state: 'Bihar',              stateShort: 'BR', defaultCity: 'Patna',             defaultDistrict: 'Patna' },
  '81': { state: 'Bihar',              stateShort: 'BR', defaultCity: 'Bhagalpur',         defaultDistrict: 'Bhagalpur' },
  '82': { state: 'Bihar',              stateShort: 'BR', defaultCity: 'Gaya',              defaultDistrict: 'Gaya' },
  '83': { state: 'Jharkhand',          stateShort: 'JH', defaultCity: 'Ranchi',            defaultDistrict: 'Ranchi' },
  '84': { state: 'Bihar',              stateShort: 'BR', defaultCity: 'Muzaffarpur',       defaultDistrict: 'Muzaffarpur' },
  '85': { state: 'Bihar',              stateShort: 'BR', defaultCity: 'Purnia',            defaultDistrict: 'Purnia' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isValidIndianPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode.trim())
}

export function formatLocationString(locality: string, district: string, state: string): string {
  const parts: string[] = []
  const loc  = locality.trim()
  const dist = district.trim()
  const st   = state.trim()
  if (loc) parts.push(loc)
  if (dist && dist.toLowerCase() !== loc.toLowerCase()) parts.push(`Dist: ${dist}`)
  if (st) parts.push(st)
  return parts.join(', ')
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Lookup PIN code location.
 * Order: cache → India Post API → 2-digit state prefix fallback
 */
export async function lookupIndianPincode(
  pincode: string,
  signal?: AbortSignal
): Promise<PincodeLocationResult | null> {
  const cleanPin = pincode.replace(/\D/g, '').slice(0, 6)
  if (!isValidIndianPincode(cleanPin)) return null

  // 1. Memory cache
  if (pincodeCache.has(cleanPin)) {
    return { ...pincodeCache.get(cleanPin)!, source: 'cache' }
  }

  // 2. Official India Post API
  try {
    const fetchController = new AbortController()
    const timer = setTimeout(() => fetchController.abort(), 8000)

    // Chain parent signal
    const onParentAbort = () => fetchController.abort()
    if (signal) signal.addEventListener('abort', onParentAbort)

    let response: Response
    try {
      response = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`, {
        signal: fetchController.signal,
        headers: { Accept: 'application/json' },
      })
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onParentAbort)
    }

    if (response.ok) {
      const data = await response.json()
      if (
        Array.isArray(data) &&
        data[0]?.Status === 'Success' &&
        Array.isArray(data[0]?.PostOffice) &&
        data[0].PostOffice.length > 0
      ) {
        const po = data[0].PostOffice[0]
        const locality  = (po.Name || po.Block || po.District || '').trim()
        const district  = (po.District || po.Division || locality).trim()
        const state     = (po.State || '').trim()
        const city      = district || locality
        const stateShort = STATE_SHORT[state] || state.slice(0, 2).toUpperCase()
        const formattedLocation = formatLocationString(locality, district, state)

        const result: PincodeLocationResult = {
          pincode: cleanPin,
          locality,
          district,
          state,
          stateShort,
          city,
          formattedLocation,
          source: 'api',
        }
        pincodeCache.set(cleanPin, result)
        return result
      }
    }
  } catch {
    // Fall through to prefix fallback
  }

  // 3. 2-digit prefix state fallback (offline / API unreachable)
  const prefix2 = cleanPin.slice(0, 2)
  const regional = PIN_PREFIX_STATE_MAP[prefix2]
  if (regional) {
    const locality  = regional.defaultCity
    const district  = regional.defaultDistrict
    const state     = regional.state
    const stateShort = regional.stateShort
    const formattedLocation = formatLocationString(locality, district, state)

    const result: PincodeLocationResult = {
      pincode: cleanPin,
      locality,
      district,
      state,
      stateShort,
      city: locality,
      formattedLocation,
      source: 'fallback',
    }
    pincodeCache.set(cleanPin, result)
    return result
  }

  return null
}
