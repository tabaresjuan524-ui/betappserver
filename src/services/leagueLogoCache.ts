import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface CachedLogo {
    identifier: string;
    localPath: string;
    originalUrl: string;
    cached: boolean;
    timestamp: number;
}

class LeagueLogoCache {
    private cache: Map<string, CachedLogo> = new Map();
    private cacheDir: string;
    private downloadingPromises: Map<string, Promise<string | null>> = new Map(); // Deduplication
    private lastRequestTime: number = 0;
    private minRequestInterval: number = 1000; // Minimum 1 second between requests

    constructor() {
        // Point to the frontend's public cache directory
        this.cacheDir = path.join(__dirname, '../../../webdev-arena-template/public/cache/league-logos');
        this.ensureCacheDirectory();
        this.loadExistingCache(); // ✅ Load existing cached files on startup
    }

    private ensureCacheDirectory(): void {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
        } catch (error) {
            console.error('❌ Failed to create league logo cache directory:', error);
        }
    }

    private loadExistingCache(): void {
        try {
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                files.forEach(file => {
                    if (file.endsWith('.png')) {
                        const identifier = file.replace('.png', '');
                        const filePath = path.join(this.cacheDir, file);
                        const stats = fs.statSync(filePath);
                        
                        this.cache.set(identifier, {
                            identifier,
                            localPath: filePath,
                            originalUrl: '', // We don't know the original URL, but that's okay
                            cached: true,
                            timestamp: stats.mtime.getTime()
                        });
                    }
                });
                console.log(`📸 Loaded ${files.length} existing logos into cache`);
            }
        } catch (error) {
            console.error('❌ Failed to load existing cache:', error);
        }
    }



    private async downloadLogo(identifier: string, url: string): Promise<string | null> {
        // Check if already downloading to prevent duplicates
        if (this.downloadingPromises.has(identifier)) {
            console.log(`⏳ Already downloading logo for ${identifier}, waiting...`);
            return this.downloadingPromises.get(identifier)!;
        }

        const downloadPromise = this.doDownloadLogo(identifier, url);
        this.downloadingPromises.set(identifier, downloadPromise);
        
        try {
            const result = await downloadPromise;
            return result;
        } finally {
            this.downloadingPromises.delete(identifier);
        }
    }

    private async doDownloadLogo(identifier: string, url: string): Promise<string | null> {
        try {
            // Rate limiting: Wait if we made a request too recently
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;
            if (timeSinceLastRequest < this.minRequestInterval) {
                const waitTime = this.minRequestInterval - timeSinceLastRequest;
                console.log(`⏱️ Rate limiting: Waiting ${waitTime}ms before downloading ${identifier}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            console.log(`🌐 Downloading logo for ${identifier} from ${url}`);
            this.lastRequestTime = Date.now();
            
            const response = await axios.get(url, { 
                responseType: 'arraybuffer',
                timeout: 5000, // 5 second timeout
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (response.status === 200) {
                const filename = `${identifier}.png`;
                const localPath = path.join(this.cacheDir, filename);
                
                fs.writeFileSync(localPath, response.data);
                
                // Cache the logo info
                this.cache.set(identifier, {
                    identifier,
                    localPath,
                    originalUrl: url,
                    cached: true,
                    timestamp: Date.now()
                });

                console.log(`✅ League logo cached successfully: ${identifier} -> ${filename}`);
                return localPath;
            }
        } catch (error) {
            console.log(`❌ Failed to cache logo for ${identifier}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return null;
    }

    async getLogoPath(identifier: string, originalUrl: string): Promise<string> {
        // Check if we have a cached version
        const cached = this.cache.get(identifier);
        
        if (cached && cached.cached) {
            // Check if file still exists
            if (fs.existsSync(cached.localPath)) {
                console.log(`💾 Cache HIT: Using cached logo for ${identifier}`);
                return `/cache/league-logos/${identifier}.png`;
            } else {
                // File was deleted, remove from cache
                console.log(`⚠️ Cache MISS: Cached file missing for ${identifier}, re-downloading`);
                this.cache.delete(identifier);
            }
        } else {
            console.log(`📤 Cache MISS: No cached version for ${identifier}, downloading...`);
        }

        // Try to download and cache the logo
        const localPath = await this.downloadLogo(identifier, originalUrl);
        if (localPath) {
            return `/cache/league-logos/${identifier}.png`;
        }

        // Fallback to original URL if caching fails
        console.log(`⚠️ Using fallback URL for ${identifier}`);
        return originalUrl;
    }



    getCacheStats(): { totalCached: number; memoryCache: number; diskUsage: string } {
        try {
            const files = fs.readdirSync(this.cacheDir);
            let totalSize = 0;
            
            files.forEach(file => {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            });

            return {
                totalCached: files.length,
                memoryCache: this.cache.size,
                diskUsage: `${(totalSize / 1024).toFixed(2)} KB`
            };
        } catch (error) {
            return { totalCached: 0, memoryCache: this.cache.size, diskUsage: '0 KB' };
        }
    }
}

// Export singleton instance
export const leagueLogoCache = new LeagueLogoCache();

console.log('📸 League logo cache initialized');
const stats = leagueLogoCache.getCacheStats();
console.log(`📊 Cache stats: ${stats.totalCached} logos cached, ${stats.diskUsage} used, ${stats.memoryCache} in memory`);
console.log('✅ Logos will be reused from cache to minimize requests to Codere servers');