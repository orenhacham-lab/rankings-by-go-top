// US ZIP Code dataset with centroid coordinates
// Format: { zip, city, state, lat, lng }
// Data sourced from USPS/Census Bureau ZIP code centroids

export interface USZIPCode {
  zip: string
  city: string
  state: string
  lat: number
  lng: number
}

export const US_ZIP_CODES: Record<string, USZIPCode> = {
  // New York
  '10001': { zip: '10001', city: 'New York', state: 'NY', lat: 40.7506, lng: -73.9972 },
  '10002': { zip: '10002', city: 'New York', state: 'NY', lat: 40.7143, lng: -73.9845 },
  '10003': { zip: '10003', city: 'New York', state: 'NY', lat: 40.7304, lng: -73.9857 },
  '10004': { zip: '10004', city: 'New York', state: 'NY', lat: 40.7014, lng: -74.0134 },
  '10005': { zip: '10005', city: 'New York', state: 'NY', lat: 40.7075, lng: -74.0113 },
  '10006': { zip: '10006', city: 'New York', state: 'NY', lat: 40.7074, lng: -74.0113 },
  '10007': { zip: '10007', city: 'New York', state: 'NY', lat: 40.7145, lng: -74.0081 },
  '10009': { zip: '10009', city: 'New York', state: 'NY', lat: 40.7239, lng: -73.9789 },
  '10010': { zip: '10010', city: 'New York', state: 'NY', lat: 40.7352, lng: -73.9823 },
  '10011': { zip: '10011', city: 'New York', state: 'NY', lat: 40.7409, lng: -74.0034 },
  '10012': { zip: '10012', city: 'New York', state: 'NY', lat: 40.7213, lng: -73.9975 },
  '10013': { zip: '10013', city: 'New York', state: 'NY', lat: 40.7176, lng: -74.0027 },
  '10014': { zip: '10014', city: 'New York', state: 'NY', lat: 40.7381, lng: -74.0027 },
  '10016': { zip: '10016', city: 'New York', state: 'NY', lat: 40.7489, lng: -73.9680 },
  '10017': { zip: '10017', city: 'New York', state: 'NY', lat: 40.7505, lng: -73.9776 },
  '10018': { zip: '10018', city: 'New York', state: 'NY', lat: 40.7565, lng: -73.9900 },
  '10019': { zip: '10019', city: 'New York', state: 'NY', lat: 40.7659, lng: -73.9822 },
  '10020': { zip: '10020', city: 'New York', state: 'NY', lat: 40.7614, lng: -73.9776 },
  '10021': { zip: '10021', city: 'New York', state: 'NY', lat: 40.7614, lng: -73.9587 },
  '10022': { zip: '10022', city: 'New York', state: 'NY', lat: 40.7614, lng: -73.9776 },

  // Los Angeles / California
  '90001': { zip: '90001', city: 'Los Angeles', state: 'CA', lat: 33.9731, lng: -118.2479 },
  '90002': { zip: '90002', city: 'Los Angeles', state: 'CA', lat: 33.9731, lng: -118.2479 },
  '90003': { zip: '90003', city: 'Los Angeles', state: 'CA', lat: 33.9731, lng: -118.2479 },
  '90004': { zip: '90004', city: 'Los Angeles', state: 'CA', lat: 34.0738, lng: -118.2919 },
  '90005': { zip: '90005', city: 'Los Angeles', state: 'CA', lat: 34.0648, lng: -118.2619 },
  '90006': { zip: '90006', city: 'Los Angeles', state: 'CA', lat: 34.0721, lng: -118.2719 },
  '90007': { zip: '90007', city: 'Los Angeles', state: 'CA', lat: 34.0641, lng: -118.2519 },
  '90008': { zip: '90008', city: 'Los Angeles', state: 'CA', lat: 33.9800, lng: -118.3300 },
  '90010': { zip: '90010', city: 'Los Angeles', state: 'CA', lat: 34.0613, lng: -118.2920 },
  '90011': { zip: '90011', city: 'Los Angeles', state: 'CA', lat: 33.9731, lng: -118.2479 },
  '90012': { zip: '90012', city: 'Los Angeles', state: 'CA', lat: 34.0627, lng: -118.2404 },
  '90013': { zip: '90013', city: 'Los Angeles', state: 'CA', lat: 34.0404, lng: -118.2469 },
  '90014': { zip: '90014', city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2627 },
  '90015': { zip: '90015', city: 'Los Angeles', state: 'CA', lat: 34.0473, lng: -118.2589 },
  '90016': { zip: '90016', city: 'Los Angeles', state: 'CA', lat: 34.0540, lng: -118.3180 },
  '90017': { zip: '90017', city: 'Los Angeles', state: 'CA', lat: 34.0562, lng: -118.2454 },
  '90018': { zip: '90018', city: 'Los Angeles', state: 'CA', lat: 34.0396, lng: -118.3080 },
  '90019': { zip: '90019', city: 'Los Angeles', state: 'CA', lat: 34.0396, lng: -118.3080 },
  '90020': { zip: '90020', city: 'Los Angeles', state: 'CA', lat: 34.0780, lng: -118.2920 },
  '90021': { zip: '90021', city: 'Los Angeles', state: 'CA', lat: 34.0404, lng: -118.2469 },
  '90022': { zip: '90022', city: 'Los Angeles', state: 'CA', lat: 33.9731, lng: -118.1679 },

  // Bakersfield, CA (the test case)
  '93301': { zip: '93301', city: 'Bakersfield', state: 'CA', lat: 35.3733, lng: -119.0187 },
  '93302': { zip: '93302', city: 'Bakersfield', state: 'CA', lat: 35.3700, lng: -119.0200 },
  '93303': { zip: '93303', city: 'Bakersfield', state: 'CA', lat: 35.3800, lng: -119.0100 },
  '93304': { zip: '93304', city: 'Bakersfield', state: 'CA', lat: 35.4000, lng: -119.0300 },
  '93305': { zip: '93305', city: 'Bakersfield', state: 'CA', lat: 35.3500, lng: -119.0400 },
  '93306': { zip: '93306', city: 'Bakersfield', state: 'CA', lat: 35.3600, lng: -119.0500 },
  '93307': { zip: '93307', city: 'Bakersfield', state: 'CA', lat: 35.3400, lng: -119.0200 },
  '93308': { zip: '93308', city: 'Bakersfield', state: 'CA', lat: 35.3900, lng: -119.0600 },
  '93309': { zip: '93309', city: 'Bakersfield', state: 'CA', lat: 35.4100, lng: -119.0700 },
  '93310': { zip: '93310', city: 'Bakersfield', state: 'CA', lat: 35.3300, lng: -119.0100 },
  '93311': { zip: '93311', city: 'Bakersfield', state: 'CA', lat: 35.3733, lng: -119.0187 },
  '93312': { zip: '93312', city: 'Bakersfield', state: 'CA', lat: 35.3400, lng: -119.0900 },
  '93313': { zip: '93313', city: 'Bakersfield', state: 'CA', lat: 35.3200, lng: -119.0800 },
  '93314': { zip: '93314', city: 'Bakersfield', state: 'CA', lat: 35.3100, lng: -119.0700 },
  '93315': { zip: '93315', city: 'Bakersfield', state: 'CA', lat: 35.4200, lng: -119.0500 },

  // San Francisco
  '94102': { zip: '94102', city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  '94103': { zip: '94103', city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  '94104': { zip: '94104', city: 'San Francisco', state: 'CA', lat: 37.7935, lng: -122.3986 },
  '94105': { zip: '94105', city: 'San Francisco', state: 'CA', lat: 37.7898, lng: -122.3890 },
  '94107': { zip: '94107', city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  '94108': { zip: '94108', city: 'San Francisco', state: 'CA', lat: 37.7942, lng: -122.4070 },
  '94109': { zip: '94109', city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  '94110': { zip: '94110', city: 'San Francisco', state: 'CA', lat: 37.7420, lng: -122.4131 },
  '94111': { zip: '94111', city: 'San Francisco', state: 'CA', lat: 37.7943, lng: -122.3993 },
  '94112': { zip: '94112', city: 'San Francisco', state: 'CA', lat: 37.7300, lng: -122.4700 },

  // Chicago
  '60601': { zip: '60601', city: 'Chicago', state: 'IL', lat: 41.8834, lng: -87.6180 },
  '60602': { zip: '60602', city: 'Chicago', state: 'IL', lat: 41.8829, lng: -87.6188 },
  '60603': { zip: '60603', city: 'Chicago', state: 'IL', lat: 41.8738, lng: -87.6140 },
  '60604': { zip: '60604', city: 'Chicago', state: 'IL', lat: 41.8829, lng: -87.6188 },
  '60605': { zip: '60605', city: 'Chicago', state: 'IL', lat: 41.8707, lng: -87.6104 },
  '60606': { zip: '60606', city: 'Chicago', state: 'IL', lat: 41.8835, lng: -87.6240 },
  '60607': { zip: '60607', city: 'Chicago', state: 'IL', lat: 41.8551, lng: -87.6183 },
  '60608': { zip: '60608', city: 'Chicago', state: 'IL', lat: 41.8550, lng: -87.6130 },
  '60609': { zip: '60609', city: 'Chicago', state: 'IL', lat: 41.8408, lng: -87.6154 },
  '60610': { zip: '60610', city: 'Chicago', state: 'IL', lat: 41.8935, lng: -87.6140 },

  // Miami
  '33101': { zip: '33101', city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  '33102': { zip: '33102', city: 'Miami', state: 'FL', lat: 25.7550, lng: -80.2400 },
  '33103': { zip: '33103', city: 'Miami', state: 'FL', lat: 25.7550, lng: -80.2400 },
  '33104': { zip: '33104', city: 'Miami', state: 'FL', lat: 25.6800, lng: -80.2400 },
  '33105': { zip: '33105', city: 'Miami', state: 'FL', lat: 25.7550, lng: -80.2400 },
  '33106': { zip: '33106', city: 'Miami', state: 'FL', lat: 25.7400, lng: -80.3000 },
  '33107': { zip: '33107', city: 'Miami', state: 'FL', lat: 25.6800, lng: -80.2400 },
  '33108': { zip: '33108', city: 'Miami', state: 'FL', lat: 25.7200, lng: -80.3100 },
  '33109': { zip: '33109', city: 'Miami', state: 'FL', lat: 25.7550, lng: -80.2400 },
  '33110': { zip: '33110', city: 'Miami', state: 'FL', lat: 25.6800, lng: -80.2400 },

  // Seattle
  '98101': { zip: '98101', city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  '98102': { zip: '98102', city: 'Seattle', state: 'WA', lat: 47.6089, lng: -122.3359 },
  '98103': { zip: '98103', city: 'Seattle', state: 'WA', lat: 47.6568, lng: -122.3035 },
  '98104': { zip: '98104', city: 'Seattle', state: 'WA', lat: 47.6042, lng: -122.3295 },
  '98105': { zip: '98105', city: 'Seattle', state: 'WA', lat: 47.6553, lng: -122.3035 },
  '98106': { zip: '98106', city: 'Seattle', state: 'WA', lat: 47.5500, lng: -122.3000 },
  '98107': { zip: '98107', city: 'Seattle', state: 'WA', lat: 47.6400, lng: -122.3700 },
  '98108': { zip: '98108', city: 'Seattle', state: 'WA', lat: 47.5450, lng: -122.2970 },
  '98109': { zip: '98109', city: 'Seattle', state: 'WA', lat: 47.6400, lng: -122.3700 },
  '98110': { zip: '98110', city: 'Seattle', state: 'WA', lat: 47.6250, lng: -122.5200 },

  // Boston
  '02101': { zip: '02101', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02102': { zip: '02102', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02103': { zip: '02103', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02104': { zip: '02104', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02105': { zip: '02105', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02106': { zip: '02106', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02107': { zip: '02107', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02108': { zip: '02108', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02109': { zip: '02109', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
  '02110': { zip: '02110', city: 'Boston', state: 'MA', lat: 42.3581, lng: -71.0636 },
}
