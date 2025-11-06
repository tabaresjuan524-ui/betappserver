const WebSocket = require('ws');

console.log('Testing immediate league events response...');
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
    console.log('Received message:');
    console.log('- Type:', parsed.type);
    console.log('- LeagueNodeId:', parsed.leagueNodeId);
    if (parsed.type === 'leagueEvents') {
      console.log('- Events count:', parsed.data ? parsed.data.length : 0);
      console.log('- Sample event:', parsed.data && parsed.data[0] ? {
        id: parsed.data[0].id,
        home_team: parsed.data[0].home_team,
        away_team: parsed.data[0].away_team,
        sport_title: parsed.data[0].sport_title
      } : 'No events');
    } else {
      console.log('- Data type:', typeof parsed);
      console.log('- Has sports:', !!parsed.sports);
      console.log('- Has liveEvents:', !!parsed.liveEvents);
      console.log('- Has codere:', !!parsed.codere);
    }
    console.log('---');
  } catch (e) {
    console.log('Raw message (first 300 chars):', data.toString().substring(0, 300));
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
}, 15000);
