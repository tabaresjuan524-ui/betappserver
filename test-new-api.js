const WebSocket = require('ws');

console.log('Testing new Codere API integration...');
console.log('Connecting to WebSocket server...');

const ws = new WebSocket('ws://localhost:8081');

ws.on('open', function open() {
  console.log('✅ Connected to WebSocket server');
  console.log('⏱️  Waiting for data...');
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data);
    console.log('\n📊 Received data structure:');
    console.log('Message Type:', parsed.messageType);
    console.log('Timestamp:', new Date(parsed.timestamp).toISOString());
    
    if (parsed.sports) {
      console.log(`🏆 Sports: ${parsed.sports.length} items`);
      if (parsed.sports.length > 0) {
        console.log('First sport:', JSON.stringify(parsed.sports[0], null, 2));
      }
    }
    
    if (parsed.liveEvents) {
      console.log(`⚡ Live Events: ${parsed.liveEvents.length} items`);
      if (parsed.liveEvents.length > 0) {
        const firstEvent = parsed.liveEvents[0];
        console.log('First live event:');
        console.log('  - API Name:', firstEvent.api_name);
        console.log('  - Sport Group:', firstEvent.sport_group);
        console.log('  - Teams:', `${firstEvent.home_team} vs ${firstEvent.away_team}`);
        console.log('  - Status:', firstEvent.status);
        console.log('  - Markets:', firstEvent.markets ? firstEvent.markets.length : 0);
        
        if (firstEvent.markets && firstEvent.markets.length > 0) {
          console.log('  - First Market:', firstEvent.markets[0].name);
          console.log('  - Market Outcomes:', firstEvent.markets[0].outcomes ? firstEvent.markets[0].outcomes.length : 0);
        }
      }
    }
    
    if (parsed.codere) {
      console.log('🎯 Codere-specific data present');
      if (parsed.codere.leftMenu) {
        console.log('  - Left Menu data available');
      }
    }

    // Check if this looks like data from our new API
    if (parsed.liveEvents && parsed.liveEvents.length > 0) {
      const event = parsed.liveEvents[0];
      console.log('\n🔍 API Source Analysis:');
      console.log('  - Contains Codere events:', event.api_name === 'codere' ? '✅ YES' : '❌ NO');
      console.log('  - Has sport_group field:', event.sport_group ? '✅ YES' : '❌ NO');
      console.log('  - Has markets data:', event.markets && event.markets.length > 0 ? '✅ YES' : '❌ NO');
    }
    
  } catch (e) {
    console.log('❌ Failed to parse JSON, raw message length:', data.toString().length);
    console.log('Raw message preview:', data.toString().substring(0, 200) + '...');
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('🔌 Connection closed');
});

// Keep the connection open for a while to see responses
setTimeout(() => {
  console.log('\n⏱️  Test completed, closing connection...');
  ws.close();
  process.exit(0);
}, 15000);

process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  ws.close();
  process.exit(0);
});