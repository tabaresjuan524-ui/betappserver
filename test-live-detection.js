// Quick test for live detection logic
function testLiveDetection(statusDescription, statusType, statusCode) {
    let isLiveEvent = false;
    
    // SofaScore live status detection - FIRST check if finished/ended
    if (statusType === 'finished' || statusType === 'ended' || 
        statusDescription.toLowerCase().includes('ended') || 
        statusDescription.toLowerCase().includes('finished') || 
        statusCode === 120) {
        isLiveEvent = false;
    } else {
        // Only check for live status if NOT finished
        isLiveEvent = statusType === 'inprogress' || 
                     statusCode === 100 || // Live status code
                     (statusDescription.toLowerCase() === 'live') ||
                     (statusDescription.toLowerCase() === 'en vivo');
    }
    
    return isLiveEvent;
}

// Test cases from the log
console.log('Test 1 - Ended/finished event:');
console.log('Input: Ended, finished, undefined');
console.log('Result:', testLiveDetection('Ended', 'finished', undefined)); // Should be false

console.log('\nTest 2 - Not started event:');
console.log('Input: Not started, notstarted, undefined');
console.log('Result:', testLiveDetection('Not started', 'notstarted', undefined)); // Should be false

console.log('\nTest 3 - Live event:');
console.log('Input: Live, inprogress, 100');
console.log('Result:', testLiveDetection('Live', 'inprogress', 100)); // Should be true

console.log('\nTest 4 - En Vivo event:');
console.log('Input: En Vivo, inprogress, 100');
console.log('Result:', testLiveDetection('En Vivo', 'inprogress', 100)); // Should be true