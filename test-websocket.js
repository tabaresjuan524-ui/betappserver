const WebSocket = require('ws');

console.log('Connecting to WebSocket server...');
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', function open() {
  console.log('Connected to WebSocket server');
  
  // Subscribe to EuroBasket league events
  console.log('Sending subscription request for EuroBasket league (5844025105)...');
  ws.send(JSON.stringify({
    action: 'getLeagueEvents',
    leagueNodeId: '5844025105'
  }));
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data);
    console.log('Received message type:', parsed.type);
    if (parsed.type === 'leagueEvents') {
      console.log('League Events data:', {
        leagueNodeId: parsed.leagueNodeId,
        eventCount: parsed.data ? parsed.data.length : 0,
        events: parsed.data
      });
    }
  } catch (e) {
    console.log('Raw message:', data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

// Keep the connection open for a while to see responses
setTimeout(() => {
  console.log('Closing connection...');
  ws.close();
  process.exit(0);
}, 10000);
