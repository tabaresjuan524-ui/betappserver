import { LiveEvent } from './commonTypes';
import { CodereSubmenu, CodereLeftMenuData } from '../sources/codere/types';

interface CacheEntry<T> {
    data: T;
    lastUpdate: number;
    subscribers: Set<string>; // Client IDs or unique identifiers
    intervalId?: NodeJS.Timeout;
    fetcher: () => Promise<T | null>;
    cacheDuration: number; // Custom cache duration for this entry
    callbacks: Set<(data: T | null) => void>; // Callbacks to execute when data updates
}

interface SubscriptionInfo {
    clientId: string;
    endpoint: string;
    callback?: (data: any) => void;
}

class CacheManager {
    private cache = new Map<string, CacheEntry<any>>();
    private subscriptions = new Map<string, Set<string>>(); // endpoint -> client IDs
    private clientSubscriptions = new Map<string, Set<string>>(); // client ID -> endpoints
    private readonly DEFAULT_CACHE_DURATION = 5000; // 5 seconds

    /**
     * Subscribe a client to an endpoint with automatic data fetching
     */
    subscribe<T>(
        endpoint: string,
        clientId: string,
        fetcher: () => Promise<T | null>,
        callback?: (data: T | null) => void,
        cacheDuration?: number
    ): T | null {
        const duration = cacheDuration || this.DEFAULT_CACHE_DURATION;
        
        // Track client subscription
        if (!this.subscriptions.has(endpoint)) {
            this.subscriptions.set(endpoint, new Set());
        }
        if (!this.clientSubscriptions.has(clientId)) {
            this.clientSubscriptions.set(clientId, new Set());
        }

        this.subscriptions.get(endpoint)!.add(clientId);
        this.clientSubscriptions.get(clientId)!.add(endpoint);

        // Get or create cache entry
        let cacheEntry = this.cache.get(endpoint);
        if (!cacheEntry) {
            cacheEntry = {
                data: null,
                lastUpdate: 0,
                subscribers: new Set(),
                fetcher,
                cacheDuration: duration,
                callbacks: new Set(),
            };
            this.cache.set(endpoint, cacheEntry);
        }

        cacheEntry.subscribers.add(clientId);
        
        // Add callback if provided
        if (callback) {
            cacheEntry.callbacks.add(callback);
        }

        // Start interval if this is the first subscriber
        if (cacheEntry.subscribers.size === 1 && !cacheEntry.intervalId) {
            this.startFetching(endpoint, cacheEntry);
        }

        // Return cached data if available and fresh
        const now = Date.now();
        if (cacheEntry.data && (now - cacheEntry.lastUpdate < cacheEntry.cacheDuration)) {
            return cacheEntry.data;
        }

        return null;
    }

    /**
     * Unsubscribe a client from an endpoint
     */
    unsubscribe(endpoint: string, clientId: string, callback?: (data: any) => void): void {
        const endpointSubs = this.subscriptions.get(endpoint);
        const clientSubs = this.clientSubscriptions.get(clientId);

        if (endpointSubs) {
            endpointSubs.delete(clientId);
            if (endpointSubs.size === 0) {
                this.subscriptions.delete(endpoint);
                this.stopFetching(endpoint);
            }
        }

        if (clientSubs) {
            clientSubs.delete(endpoint);
            if (clientSubs.size === 0) {
                this.clientSubscriptions.delete(clientId);
            }
        }

        const cacheEntry = this.cache.get(endpoint);
        if (cacheEntry) {
            cacheEntry.subscribers.delete(clientId);
            
            // Remove callback if provided
            if (callback) {
                cacheEntry.callbacks.delete(callback);
            }
            
            if (cacheEntry.subscribers.size === 0) {
                this.stopFetching(endpoint);
            }
        }
    }

    /**
     * Unsubscribe a client from all endpoints (useful when client disconnects)
     */
    unsubscribeClient(clientId: string): void {
        const clientSubs = this.clientSubscriptions.get(clientId);
        if (clientSubs) {
            const endpoints = Array.from(clientSubs);
            endpoints.forEach(endpoint => this.unsubscribe(endpoint, clientId));
        }
    }

    /**
     * Get current cached data without subscribing
     */
    getCachedData<T>(endpoint: string): T | null {
        const cacheEntry = this.cache.get(endpoint);
        if (!cacheEntry) return null;

        const now = Date.now();
        if (now - cacheEntry.lastUpdate < cacheEntry.cacheDuration) {
            return cacheEntry.data;
        }

        return null;
    }

    /**
     * Start automatic fetching for an endpoint
     */
    private startFetching<T>(
        endpoint: string,
        cacheEntry: CacheEntry<T>
    ): void {
        console.log(`🔄 Starting automatic fetching for: ${endpoint}`);

        const fetchAndUpdate = async () => {
            try {
                const data = await cacheEntry.fetcher();
                if (data !== null) {
                    cacheEntry.data = data;
                    cacheEntry.lastUpdate = Date.now();
                    
                    // Execute all callbacks
                    cacheEntry.callbacks.forEach(callback => {
                        try {
                            callback(data);
                        } catch (error) {
                            console.error(`Error executing callback for ${endpoint}:`, error);
                        }
                    });
                    
                    console.log(`✅ Updated cache for: ${endpoint} (${cacheEntry.subscribers.size} subscribers)`);
                }
            } catch (error) {
                console.error(`❌ Error fetching data for ${endpoint}:`, error);
            }
        };

        // Fetch immediately if no data or stale data
        const now = Date.now();
        if (!cacheEntry.data || (now - cacheEntry.lastUpdate >= cacheEntry.cacheDuration)) {
            fetchAndUpdate();
        }

        // Set up interval for regular updates
        cacheEntry.intervalId = setInterval(fetchAndUpdate, cacheEntry.cacheDuration);
    }

    /**
     * Stop automatic fetching for an endpoint
     */
    private stopFetching(endpoint: string): void {
        const cacheEntry = this.cache.get(endpoint);
        if (cacheEntry && cacheEntry.intervalId) {
            console.log(`⏹️ Stopping automatic fetching for: ${endpoint}`);
            clearInterval(cacheEntry.intervalId);
            cacheEntry.intervalId = undefined;
            
            // Optionally remove from cache if no subscribers
            if (cacheEntry.subscribers.size === 0) {
                this.cache.delete(endpoint);
            }
        }
    }

    /**
     * Get statistics about current cache state
     */
    getStats(): {
        activeEndpoints: number;
        totalSubscriptions: number;
        endpointDetails: Array<{
            endpoint: string;
            subscribers: number;
            hasActiveInterval: boolean;
            lastUpdate: Date | null;
        }>;
    } {
        const endpointDetails = Array.from(this.cache.entries()).map(([endpoint, entry]) => ({
            endpoint,
            subscribers: entry.subscribers.size,
            hasActiveInterval: !!entry.intervalId,
            lastUpdate: entry.lastUpdate > 0 ? new Date(entry.lastUpdate) : null,
        }));

        return {
            activeEndpoints: this.cache.size,
            totalSubscriptions: Array.from(this.clientSubscriptions.values())
                .reduce((total, subs) => total + subs.size, 0),
            endpointDetails,
        };
    }

    /**
     * Force refresh data for an endpoint
     */
    async forceRefresh(endpoint: string): Promise<void> {
        const cacheEntry = this.cache.get(endpoint);
        if (cacheEntry) {
            try {
                const data = await cacheEntry.fetcher();
                if (data !== null) {
                    cacheEntry.data = data;
                    cacheEntry.lastUpdate = Date.now();
                }
            } catch (error) {
                console.error(`Error force refreshing ${endpoint}:`, error);
            }
        }
    }
}

// Export singleton instance
export const cacheManager = new CacheManager();

// Export types for external use
export type { SubscriptionInfo };
