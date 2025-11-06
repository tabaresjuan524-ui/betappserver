const { subscribeToLeagueEvents } = require('./dist/sources/codere/index.js');

console.log('Testing league subscription for EuroBasket (5844025105)...');
const result = subscribeToLeagueEvents('5844025105', 'test-client');
console.log('Subscription result:', result);
