/**
 * DSA OS — Indian PIN Code Location Lookup Service
 *
 * Provides resilient, cached PIN code location lookups with:
 * 1. Immediate in-memory caching to eliminate redundant network calls
 * 2. Official India Post API integration (https://api.postalpincode.in/pincode/{pincode})
 * 3. Comprehensive offline fallback directory for major Indian cities and regional postal circles
 * 4. Stale request cancellation / sequence protection
 */

export interface PincodeLocationResult {
  pincode: string
  city: string
  district: string
  state: string
  stateShort: string
  source: 'cache' | 'api' | 'fallback'
}

// In-memory cache for fast, repeat lookups
const pincodeCache = new Map<string, PincodeLocationResult>()

// State to 2-letter abbreviation mapping
const STATE_SHORT_CODES: Record<string, string> = {
  'Maharashtra': 'MH',
  'Delhi': 'DL',
  'Karnataka': 'KA',
  'Tamil Nadu': 'TN',
  'Telangana': 'TS',
  'Andhra Pradesh': 'AP',
  'Gujarat': 'GJ',
  'Rajasthan': 'RJ',
  'Uttar Pradesh': 'UP',
  'Uttarakhand': 'UK',
  'Haryana': 'HR',
  'Punjab': 'PB',
  'Madhya Pradesh': 'MP',
  'West Bengal': 'WB',
  'Kerala': 'KL',
  'Bihar': 'BR',
  'Jharkhand': 'JH',
  'Odisha': 'OD',
  'Assam': 'AS',
  'Chandigarh': 'CH',
  'Goa': 'GA',
  'Himachal Pradesh': 'HP',
  'Jammu and Kashmir': 'JK',
  'Chhattisgarh': 'CG',
}

// Comprehensive directory of major Indian PIN codes for immediate offline / test availability
const KNOWN_PINCODES: Record<string, { city: string; district: string; state: string; stateShort: string }> = {
  // Maharashtra
  '400001': { city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra', stateShort: 'MH' },
  '400050': { city: 'Bandra', district: 'Mumbai', state: 'Maharashtra', stateShort: 'MH' },
  '400053': { city: 'Andheri West', district: 'Mumbai', state: 'Maharashtra', stateShort: 'MH' },
  '400058': { city: 'Andheri', district: 'Mumbai', state: 'Maharashtra', stateShort: 'MH' },
  '400092': { city: 'Borivali', district: 'Mumbai', state: 'Maharashtra', stateShort: 'MH' },
  '400601': { city: 'Thane', district: 'Thane', state: 'Maharashtra', stateShort: 'MH' },
  '400703': { city: 'Vashi', district: 'Navi Mumbai', state: 'Maharashtra', stateShort: 'MH' },
  '411001': { city: 'Pune', district: 'Pune', state: 'Maharashtra', stateShort: 'MH' },
  '411014': { city: 'Viman Nagar', district: 'Pune', state: 'Maharashtra', stateShort: 'MH' },
  '422001': { city: 'Nashik', district: 'Nashik', state: 'Maharashtra', stateShort: 'MH' },
  '431001': { city: 'Aurangabad', district: 'Chhatrapati Sambhajinagar', state: 'Maharashtra', stateShort: 'MH' },
  '440001': { city: 'Nagpur', district: 'Nagpur', state: 'Maharashtra', stateShort: 'MH' },
  '416001': { city: 'Kolhapur', district: 'Kolhapur', state: 'Maharashtra', stateShort: 'MH' },

  // Delhi NCR
  '110001': { city: 'New Delhi', district: 'Central Delhi', state: 'Delhi', stateShort: 'DL' },
  '110020': { city: 'Okhla', district: 'South Delhi', state: 'Delhi', stateShort: 'DL' },
  '110085': { city: 'Rohini', district: 'North West Delhi', state: 'Delhi', stateShort: 'DL' },
  '201301': { city: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', stateShort: 'UP' },
  '122001': { city: 'Gurugram', district: 'Gurugram', state: 'Haryana', stateShort: 'HR' },
  '121001': { city: 'Faridabad', district: 'Faridabad', state: 'Haryana', stateShort: 'HR' },

  // Karnataka
  '560001': { city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', stateShort: 'KA' },
  '560034': { city: 'Koramangala', district: 'Bengaluru Urban', state: 'Karnataka', stateShort: 'KA' },
  '560066': { city: 'Whitefield', district: 'Bengaluru Urban', state: 'Karnataka', stateShort: 'KA' },
  '570001': { city: 'Mysuru', district: 'Mysuru', state: 'Karnataka', stateShort: 'KA' },

  // Telangana & Andhra Pradesh
  '500001': { city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana', stateShort: 'TS' },
  '500081': { city: 'HITEC City', district: 'Hyderabad', state: 'Telangana', stateShort: 'TS' },
  '530001': { city: 'Visakhapatnam', district: 'Visakhapatnam', state: 'Andhra Pradesh', stateShort: 'AP' },

  // Gujarat
  '380001': { city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', stateShort: 'GJ' },
  '390001': { city: 'Vadodara', district: 'Vadodara', state: 'Gujarat', stateShort: 'GJ' },
  '395001': { city: 'Surat', district: 'Surat', state: 'Gujarat', stateShort: 'GJ' },
  '360001': { city: 'Rajkot', district: 'Rajkot', state: 'Gujarat', stateShort: 'GJ' },

  // Rajasthan
  '302001': { city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan', stateShort: 'RJ' },
  '302015': { city: 'Malviya Nagar', district: 'Jaipur', state: 'Rajasthan', stateShort: 'RJ' },
  '342001': { city: 'Jodhpur', district: 'Jodhpur', state: 'Rajasthan', stateShort: 'RJ' },
  '313001': { city: 'Udaipur', district: 'Udaipur', state: 'Rajasthan', stateShort: 'RJ' },

  // Tamil Nadu
  '600001': { city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', stateShort: 'TN' },
  '600040': { city: 'Anna Nagar', district: 'Chennai', state: 'Tamil Nadu', stateShort: 'TN' },
  '641001': { city: 'Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu', stateShort: 'TN' },

  // West Bengal
  '700001': { city: 'Kolkata', district: 'Kolkata', state: 'West Bengal', stateShort: 'WB' },
  '700091': { city: 'Salt Lake', district: 'North 24 Parganas', state: 'West Bengal', stateShort: 'WB' },

  // Kerala
  '682001': { city: 'Kochi', district: 'Ernakulam', state: 'Kerala', stateShort: 'KL' },
  '695001': { city: 'Thiruvananthapuram', district: 'Thiruvananthapuram', state: 'Kerala', stateShort: 'KL' },

  // Madhya Pradesh
  '452001': { city: 'Indore', district: 'Indore', state: 'Madhya Pradesh', stateShort: 'MP' },
  '462001': { city: 'Bhopal', district: 'Bhopal', state: 'Madhya Pradesh', stateShort: 'MP' },

  // Uttar Pradesh
  '226001': { city: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', stateShort: 'UP' },
  '208001': { city: 'Kanpur', district: 'Kanpur Nagar', state: 'Uttar Pradesh', stateShort: 'UP' },
  '221001': { city: 'Varanasi', district: 'Varanasi', state: 'Uttar Pradesh', stateShort: 'UP' },
}

// 2-digit PIN prefix mapping to Indian States for universal fallback
const PIN_PREFIX_STATE_MAP: Record<string, { state: string; stateShort: string; defaultCity: string }> = {
  '11': { state: 'Delhi', stateShort: 'DL', defaultCity: 'Delhi' },
  '12': { state: 'Haryana', stateShort: 'HR', defaultCity: 'Gurugram' },
  '13': { state: 'Haryana', stateShort: 'HR', defaultCity: 'Ambala' },
  '14': { state: 'Punjab', stateShort: 'PB', defaultCity: 'Ludhiana' },
  '15': { state: 'Punjab', stateShort: 'PB', defaultCity: 'Bathinda' },
  '16': { state: 'Chandigarh', stateShort: 'CH', defaultCity: 'Chandigarh' },
  '17': { state: 'Himachal Pradesh', stateShort: 'HP', defaultCity: 'Shimla' },
  '18': { state: 'Jammu and Kashmir', stateShort: 'JK', defaultCity: 'Jammu' },
  '19': { state: 'Jammu and Kashmir', stateShort: 'JK', defaultCity: 'Srinagar' },
  '20': { state: 'Uttar Pradesh', stateShort: 'UP', defaultCity: 'Noida' },
  '21': { state: 'Uttar Pradesh', stateShort: 'UP', defaultCity: 'Prayagraj' },
  '22': { state: 'Uttar Pradesh', stateShort: 'UP', defaultCity: 'Lucknow' },
  '23': { state: 'Uttar Pradesh', stateShort: 'UP', defaultCity: 'Faizabad' },
  '24': { state: 'Uttarakhand', stateShort: 'UK', defaultCity: 'Dehradun' },
  '25': { state: 'Uttar Pradesh', stateShort: 'UP', defaultCity: 'Meerut' },
  '26': { state: 'Uttarakhand', stateShort: 'UK', defaultCity: 'Nainital' },
  '27': { state: 'Uttar Pradesh', stateShort: 'UP', defaultCity: 'Gorakhpur' },
  '28': { state: 'Uttar Pradesh', stateShort: 'UP', defaultCity: 'Jhansi' },
  '30': { state: 'Rajasthan', stateShort: 'RJ', defaultCity: 'Jaipur' },
  '31': { state: 'Rajasthan', stateShort: 'RJ', defaultCity: 'Udaipur' },
  '32': { state: 'Rajasthan', stateShort: 'RJ', defaultCity: 'Kota' },
  '33': { state: 'Rajasthan', stateShort: 'RJ', defaultCity: 'Bikaner' },
  '34': { state: 'Rajasthan', stateShort: 'RJ', defaultCity: 'Jodhpur' },
  '36': { state: 'Gujarat', stateShort: 'GJ', defaultCity: 'Rajkot' },
  '37': { state: 'Gujarat', stateShort: 'GJ', defaultCity: 'Jamnagar' },
  '38': { state: 'Gujarat', stateShort: 'GJ', defaultCity: 'Ahmedabad' },
  '39': { state: 'Gujarat', stateShort: 'GJ', defaultCity: 'Surat' },
  '40': { state: 'Maharashtra', stateShort: 'MH', defaultCity: 'Mumbai' },
  '41': { state: 'Maharashtra', stateShort: 'MH', defaultCity: 'Pune' },
  '42': { state: 'Maharashtra', stateShort: 'MH', defaultCity: 'Nashik' },
  '43': { state: 'Maharashtra', stateShort: 'MH', defaultCity: 'Chhatrapati Sambhajinagar' },
  '44': { state: 'Maharashtra', stateShort: 'MH', defaultCity: 'Nagpur' },
  '45': { state: 'Madhya Pradesh', stateShort: 'MP', defaultCity: 'Indore' },
  '46': { state: 'Madhya Pradesh', stateShort: 'MP', defaultCity: 'Bhopal' },
  '47': { state: 'Madhya Pradesh', stateShort: 'MP', defaultCity: 'Gwalior' },
  '48': { state: 'Madhya Pradesh', stateShort: 'MP', defaultCity: 'Jabalpur' },
  '49': { state: 'Chhattisgarh', stateShort: 'CG', defaultCity: 'Raipur' },
  '50': { state: 'Telangana', stateShort: 'TS', defaultCity: 'Hyderabad' },
  '51': { state: 'Andhra Pradesh', stateShort: 'AP', defaultCity: 'Kurnool' },
  '52': { state: 'Andhra Pradesh', stateShort: 'AP', defaultCity: 'Vijayawada' },
  '53': { state: 'Andhra Pradesh', stateShort: 'AP', defaultCity: 'Visakhapatnam' },
  '56': { state: 'Karnataka', stateShort: 'KA', defaultCity: 'Bengaluru' },
  '57': { state: 'Karnataka', stateShort: 'KA', defaultCity: 'Mangaluru' },
  '58': { state: 'Karnataka', stateShort: 'KA', defaultCity: 'Hubballi' },
  '59': { state: 'Karnataka', stateShort: 'KA', defaultCity: 'Belagavi' },
  '60': { state: 'Tamil Nadu', stateShort: 'TN', defaultCity: 'Chennai' },
  '61': { state: 'Tamil Nadu', stateShort: 'TN', defaultCity: 'Thanjavur' },
  '62': { state: 'Tamil Nadu', stateShort: 'TN', defaultCity: 'Madurai' },
  '63': { state: 'Tamil Nadu', stateShort: 'TN', defaultCity: 'Salem' },
  '64': { state: 'Tamil Nadu', stateShort: 'TN', defaultCity: 'Coimbatore' },
  '67': { state: 'Kerala', stateShort: 'KL', defaultCity: 'Kozhikode' },
  '68': { state: 'Kerala', stateShort: 'KL', defaultCity: 'Kochi' },
  '69': { state: 'Kerala', stateShort: 'KL', defaultCity: 'Thiruvananthapuram' },
  '70': { state: 'West Bengal', stateShort: 'WB', defaultCity: 'Kolkata' },
  '71': { state: 'West Bengal', stateShort: 'WB', defaultCity: 'Howrah' },
  '72': { state: 'West Bengal', stateShort: 'WB', defaultCity: 'Midnapore' },
  '73': { state: 'West Bengal', stateShort: 'WB', defaultCity: 'Siliguri' },
  '74': { state: 'West Bengal', stateShort: 'WB', defaultCity: 'Barasat' },
  '75': { state: 'Odisha', stateShort: 'OD', defaultCity: 'Bhubaneswar' },
  '76': { state: 'Odisha', stateShort: 'OD', defaultCity: 'Cuttack' },
  '77': { state: 'Odisha', stateShort: 'OD', defaultCity: 'Rourkela' },
  '78': { state: 'Assam', stateShort: 'AS', defaultCity: 'Guwahati' },
  '80': { state: 'Bihar', stateShort: 'BR', defaultCity: 'Patna' },
  '81': { state: 'Bihar', stateShort: 'BR', defaultCity: 'Bhagalpur' },
  '82': { state: 'Bihar', stateShort: 'BR', defaultCity: 'Gaya' },
  '83': { state: 'Jharkhand', stateShort: 'JH', defaultCity: 'Ranchi' },
  '84': { state: 'Bihar', stateShort: 'BR', defaultCity: 'Muzaffarpur' },
  '85': { state: 'Bihar', stateShort: 'BR', defaultCity: 'Purnia' },
}

/**
 * Validates whether a string is a formally valid 6-digit Indian Postal PIN code.
 */
export function isValidIndianPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode.trim())
}

/**
 * Performs a resilient PIN code lookup.
 * Tries cache -> API (India Post) -> offline known directory -> prefix regional fallback.
 */
export async function lookupIndianPincode(
  pincode: string,
  signal?: AbortSignal
): Promise<PincodeLocationResult | null> {
  const cleanPin = pincode.replace(/\D/g, '').slice(0, 6)
  if (!isValidIndianPincode(cleanPin)) {
    return null
  }

  // 1. Check in-memory cache
  if (pincodeCache.has(cleanPin)) {
    return pincodeCache.get(cleanPin)!
  }

  // 2. Try online India Post postal lookup API with 3-second timeout
  try {
    const fetchController = new AbortController()
    const timer = setTimeout(() => fetchController.abort(), 3000)

    const onParentAbort = () => fetchController.abort()
    if (signal) {
      signal.addEventListener('abort', onParentAbort)
    }

    const response = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`, {
      signal: fetchController.signal,
    })
    clearTimeout(timer)
    if (signal) {
      signal.removeEventListener('abort', onParentAbort)
    }

    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data) && data[0]?.Status === 'Success' && Array.isArray(data[0]?.PostOffice) && data[0].PostOffice.length > 0) {
        const postOffice = data[0].PostOffice[0]
        const state = postOffice.State || 'Maharashtra'
        const district = postOffice.District || postOffice.Block || postOffice.Name || 'Mumbai'
        const city = district
        const stateShort = STATE_SHORT_CODES[state] || state.slice(0, 2).toUpperCase()

        const result: PincodeLocationResult = {
          pincode: cleanPin,
          city,
          district,
          state,
          stateShort,
          source: 'api',
        }
        pincodeCache.set(cleanPin, result)
        return result
      }
    }
  } catch {
    // Graceful fallback to built-in directory
  }

  // 3. Known exact PIN code directory match
  if (KNOWN_PINCODES[cleanPin]) {
    const known = KNOWN_PINCODES[cleanPin]
    const result: PincodeLocationResult = {
      pincode: cleanPin,
      city: known.city,
      district: known.district,
      state: known.state,
      stateShort: known.stateShort,
      source: 'fallback',
    }
    pincodeCache.set(cleanPin, result)
    return result
  }

  // 4. Regional PIN Prefix fallback
  const prefix = cleanPin.slice(0, 2)
  if (PIN_PREFIX_STATE_MAP[prefix]) {
    const regional = PIN_PREFIX_STATE_MAP[prefix]
    const result: PincodeLocationResult = {
      pincode: cleanPin,
      city: regional.defaultCity,
      district: regional.defaultCity,
      state: regional.state,
      stateShort: regional.stateShort,
      source: 'fallback',
    }
    pincodeCache.set(cleanPin, result)
    return result
  }

  return null
}
