const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(express.json());

const parks = { 
    5: 'Epcot',
    6: 'Magic Kingdom',
    7: 'Hollywood Studios',
    8: 'Animal Kingdom'
}

// Database file for storing historical wait times
const WAIT_TIMES_DB = path.join(__dirname, 'wait_times_history.json');

/**
 * Load wait times history from file
 */
function loadWaitTimesHistory() {
  try {
    if (fs.existsSync(WAIT_TIMES_DB)) {
      const data = fs.readFileSync(WAIT_TIMES_DB, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading wait times history:', error.message);
  }
  return {};
}

/**
 * Save wait times to history
 */
function saveWaitTimesHistory(history) {
  try {
    fs.writeFileSync(WAIT_TIMES_DB, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Error saving wait times history:', error.message);
  }
}

/**
 * Log current wait times to history
 */
function logWaitTimes(parksData) {
  const history = loadWaitTimesHistory();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const timestamp = new Date().toISOString();

  if (!history[today]) {
    history[today] = [];
  }

  // Extract wait times for each ride (only open rides)
  const snapshot = {
    timestamp,
    parks: parksData.map(park => ({
      name: park.name,
      id: park.id,
      lands: park.lands.map(land => ({
        name: land.name,
        rides: land.rides
          .filter(ride => ride.is_open) // Only include open rides
          .map(ride => ({
            id: ride.id,
            name: ride.name,
            wait_time: ride.wait_time,
            is_open: ride.is_open
          }))
      })).filter(land => land.rides.length > 0) // Only include lands with open rides
    })).filter(park => park.lands.length > 0) // Only include parks with open rides
  };

  // Only save snapshot if there are open rides
  if (snapshot.parks.length > 0) {
    history[today].push(snapshot);
    saveWaitTimesHistory(history);
  }
}

/**
 * Calculate average wait times for a given day
 */
function getAverageWaitTimes(date) {
  const history = loadWaitTimesHistory();
  
  if (!history[date] || history[date].length === 0) {
    return null;
  }

  const snapshots = history[date];
  const averages = {};

  snapshots.forEach(snapshot => {
    snapshot.parks.forEach(park => {
      if (!averages[park.name]) {
        averages[park.name] = { name: park.name, id: park.id, lands: {} };
      }

      park.lands.forEach(land => {
        if (!averages[park.name].lands[land.name]) {
          averages[park.name].lands[land.name] = { name: land.name, rides: {} };
        }

        land.rides.forEach(ride => {
          if (!averages[park.name].lands[land.name].rides[ride.id]) {
            averages[park.name].lands[land.name].rides[ride.id] = {
              id: ride.id,
              name: ride.name,
              wait_times: [],
              times_open: 0,
              times_closed: 0
            };
          }

          averages[park.name].lands[land.name].rides[ride.id].wait_times.push(ride.wait_time);
          if (ride.is_open) {
            averages[park.name].lands[land.name].rides[ride.id].times_open++;
          } else {
            averages[park.name].lands[land.name].rides[ride.id].times_closed++;
          }
        });
      });
    });
  });

  // Calculate averages
  const result = {};
  for (const [parkName, parkData] of Object.entries(averages)) {
    result[parkName] = {
      name: parkData.name,
      id: parkData.id,
      lands: {}
    };

    for (const [landName, landData] of Object.entries(parkData.lands)) {
      result[parkName].lands[landName] = {
        name: landData.name,
        rides: {}
      };

      for (const [rideId, rideData] of Object.entries(landData.rides)) {
        const avgWaitTime = rideData.wait_times.length > 0
          ? (rideData.wait_times.reduce((a, b) => a + b, 0) / rideData.wait_times.length).toFixed(1)
          : 0;
        
        const openPercentage = ((rideData.times_open / (rideData.times_open + rideData.times_closed)) * 100).toFixed(1);

        result[parkName].lands[landName].rides[rideId] = {
          id: rideData.id,
          name: rideData.name,
          avg_wait_time: parseFloat(avgWaitTime),
          open_percentage: parseFloat(openPercentage),
          samples: rideData.wait_times.length
        };
      }
    }
  }

  return result;
}
/**
 * Fetch wait times for all Disney World parks
 */
async function fetchDisneyWaitTimes() {
  try {
    const allParksData = [];
    
    // Iterate through each park ID
    for (const [parkId, parkName] of Object.entries(parks)) {
      try {
        console.log(`Fetching wait times for ${parkName}...`);
        const apiUrl = `https://queue-times.com/parks/${parkId}/queue_times.json`;
        
        const response = await fetchUrl(apiUrl);
        const data = JSON.parse(response);
        
        // Add park name to the data
        data.name = parkName;
        data.id = parkId;
        
        allParksData.push(data);
      } catch (error) {
        console.error(`Error fetching ${parkName}:`, error.message);
        // Continue with other parks even if one fails
      }
    }
    
    return allParksData;
    
  } catch (error) {
    console.error('Error fetching wait times:', error.message);
    throw error;
  }
}

/**
 * Helper function to make HTTPS requests
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

// API endpoint for wait times
app.get('/api/wait-times', async (req, res) => {
  try {
    console.log('\n📡 API Request received for wait times');
    const data = await fetchDisneyWaitTimes();
    
    console.log('\n✅ API Response:');
   // console.log(JSON.stringify(data, null, 2));
    
    // Log the wait times to history
    logWaitTimes(data);
    
    res.json(data);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch wait times', message: error.message });
  }
});

/**
 * API endpoint for average wait times by day
 */
app.get('/api/average-wait-times', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`\n📊 API Request received for average wait times on ${date}`);
    
    const averages = getAverageWaitTimes(date);
    
    if (!averages) {
      return res.status(404).json({ 
        error: 'No data available', 
        message: `No wait time data found for ${date}` 
      });
    }
    
    console.log(`\n✅ Average Wait Times for ${date}:`);
   // console.log(JSON.stringify(averages, null, 2));
    
    res.json(averages);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch average wait times', message: error.message });
  }
});

/**
 * API endpoint for available dates with data
 */
app.get('/api/available-dates', (req, res) => {
  try {
    const history = loadWaitTimesHistory();
    const dates = Object.keys(history).sort().reverse(); // Newest first
    
    res.json({ dates });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch available dates', message: error.message });
  }
});

/**
 * API endpoint for ride-specific averages
 * Query params: rideId, parkName, landName
 */
app.get('/api/ride-averages', (req, res) => {
  try {
    const { rideId, parkName, landName } = req.query;
    
    if (!rideId || !parkName || !landName) {
      return res.status(400).json({ error: 'Missing required params: rideId, parkName, landName' });
    }

    const history = loadWaitTimesHistory();
    const dates = Object.keys(history).sort();
    
    const rideWaitTimes = {
      daily: {},
      weekly: []
    };
    
    // Collect all wait times for this ride
    dates.forEach(date => {
      const snapshots = history[date];
      const dayWaitTimes = [];
      
      snapshots.forEach(snapshot => {
        const park = snapshot.parks.find(p => p.name === parkName);
        if (!park) return;
        
        const land = park.lands.find(l => l.name === landName);
        if (!land) return;
        
        const ride = land.rides.find(r => r.id === parseInt(rideId));
        if (ride) {
          dayWaitTimes.push(ride.wait_time);
          rideWaitTimes.weekly.push(ride.wait_time);
        }
      });
      
      // Calculate daily average
      if (dayWaitTimes.length > 0) {
        const avg = (dayWaitTimes.reduce((a, b) => a + b, 0) / dayWaitTimes.length).toFixed(1);
        rideWaitTimes.daily[date] = {
          avg: parseFloat(avg),
          samples: dayWaitTimes.length,
          min: Math.min(...dayWaitTimes),
          max: Math.max(...dayWaitTimes)
        };
      }
    });
    
    // Calculate weekly average
    let weeklyAvg = null;
    if (rideWaitTimes.weekly.length > 0) {
      weeklyAvg = (rideWaitTimes.weekly.reduce((a, b) => a + b, 0) / rideWaitTimes.weekly.length).toFixed(1);
    }
    
    // Get today's average
    const today = new Date().toISOString().split('T')[0];
    const todayAvg = rideWaitTimes.daily[today];
    
    res.json({
      rideId,
      parkName,
      landName,
      today_avg: todayAvg ? parseFloat(todayAvg.avg) : null,
      today_samples: todayAvg ? todayAvg.samples : 0,
      weekly_avg: weeklyAvg ? parseFloat(weeklyAvg) : null,
      weekly_samples: rideWaitTimes.weekly.length
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch ride averages', message: error.message });
  }
});

/**
 * API endpoint for detailed ride history (for charts)
 * Query params: rideId, parkName, landName
 */
app.get('/api/ride-history', (req, res) => {
  try {
    const { rideId, parkName, landName } = req.query;
    
    if (!rideId || !parkName || !landName) {
      return res.status(400).json({ error: 'Missing required params: rideId, parkName, landName' });
    }

    const history = loadWaitTimesHistory();
    const dates = Object.keys(history).sort();
    
    const todayData = [];
    const weeklyData = [];
    
    // Get last 7 days
    const last7Days = dates.slice(-7);
    
    last7Days.forEach(date => {
      const snapshots = history[date];
      const dayWaitTimes = [];
      
      snapshots.forEach(snapshot => {
        const park = snapshot.parks.find(p => p.name === parkName);
        if (!park) return;
        
        const land = park.lands.find(l => l.name === landName);
        if (!land) return;
        
        const ride = land.rides.find(r => r.id === parseInt(rideId));
        if (ride) {
          dayWaitTimes.push(ride.wait_time);
          
          // Add to today's data if it's today
          if (date === new Date().toISOString().split('T')[0]) {
            todayData.push({
              timestamp: snapshot.timestamp,
              wait_time: ride.wait_time
            });
          }
        }
      });
      
      // Calculate daily average for weekly chart
      if (dayWaitTimes.length > 0) {
        const avg = (dayWaitTimes.reduce((a, b) => a + b, 0) / dayWaitTimes.length).toFixed(1);
        weeklyData.push({
          date: date,
          avg: parseFloat(avg),
          samples: dayWaitTimes.length
        });
      }
    });
    
    res.json({
      rideId,
      parkName,
      landName,
      today: todayData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
      weekly: weeklyData
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch ride history', message: error.message });
  }
});

// Serve index.html as default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Disney World Wait Times Server running on http://localhost:${PORT}`);
  console.log(`📱 Open your browser and navigate to http://localhost:${PORT}`);
});
