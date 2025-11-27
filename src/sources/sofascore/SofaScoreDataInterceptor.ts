import { EventEmitter } from 'events';
import { Page, HTTPRequest, HTTPResponse } from 'puppeteer-core';
import axios from 'axios';

export class SofaScoreDataInterceptor extends EventEmitter {
    private browserId: number;
    private eventId: string;
    private page: Page | null = null;

    constructor(browserId: number, eventId: string) {
        super();
        this.browserId = browserId;
        this.eventId = eventId;
    }

    public async setupInterception(page: Page) {
        this.page = page;
        // Block unnecessary resources to save bandwidth and improve speed
        await page.setRequestInterception(true);
        page.on('request', (request: HTTPRequest) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Use a single, robust response handler for all API responses
        page.on('response', this.handleResponse.bind(this));
    }

    private async handleResponse(response: HTTPResponse) {
        const apiUrl = response.url();

        // We only care about successful API responses from sofascore
        if (!apiUrl.includes('/api/v1/') || response.status() !== 200) {
            return;
        }

        try {
            const responseBody = await response.text();

            if (!responseBody.trim()) {
                return;
            }

            const data = JSON.parse(responseBody);
            const endpoint = apiUrl.split('/api/v1/')[1];

            this.emit('sofascore-data', { endpoint, data });
        } catch (error) {
            if (error instanceof Error && error.message.includes('No data found for resource with given identifier')) {
                // The response buffer is gone, a common race condition in Puppeteer.
                // Fallback: Open the URL in a new, temporary tab to capture the data.
                if (!this.page) {
                    console.error(`❌ [Browser ${this.browserId}] Event ${this.eventId} - Cannot fallback for ${apiUrl} because page is not attached.`);
                    return;
                }

                let tempPage: Page | null = null;
                try {
                    const browser = this.page.browser();
                    tempPage = await browser.newPage();

                    // Set a realistic user agent
                    await tempPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                    console.log(`🔄 [Browser ${this.browserId}] Event ${this.eventId} - Attempting fallback for ${apiUrl} in new tab.`);

                    // Navigate to the API URL. The response will be the JSON content.
                    const response = await tempPage.goto(apiUrl, { waitUntil: 'networkidle0' });

                    if (!response || !response.ok()) {
                        throw new Error(`Fallback navigation failed with status ${response ? response.status() : 'unknown'}`);
                    }

                    // The API response is often wrapped in <pre> tags when loaded directly.
                    const content = await tempPage.evaluate(() => {
                        return document.body.textContent;
                    });

                    if (!content) {
                        throw new Error('Fallback page had no content.');
                    }

                    const data = JSON.parse(content);
                    const endpoint = apiUrl.split('/api/v1/')[1];
                    this.emit('sofascore-data', { endpoint, data });

                } catch (fallbackError) {
                    if (fallbackError instanceof Error) {
                        console.error(`❌ [Browser ${this.browserId}] Event ${this.eventId} - New tab fallback failed for ${apiUrl}: ${fallbackError.message}`);
                    } else {
                        console.error(`❌ [Browser ${this.browserId}] Event ${this.eventId} - An unknown error occurred during new tab fallback for ${apiUrl}: ${String(fallbackError)}`);
                    }
                } finally {
                    if (tempPage) {
                        await tempPage.close();
                    }
                }
            } else if (error instanceof Error) {
                // Handle JSON parsing errors or other specific errors silently if needed
                if (!(error instanceof SyntaxError)) {
                    console.error(`❌ [Browser ${this.browserId}] Event ${this.eventId} - Error processing response for ${apiUrl}: ${error.message}`);
                }
            } else {
                console.error(`❌ [Browser ${this.browserId}] Event ${this.eventId} - An unknown error occurred for ${apiUrl}: ${String(error)}`);
            }
        }
    }

    public async close() {
        if (this.page) {

            // Clean up the listener to prevent memory leaks
            this.page.off('response', this.handleResponse);
        }
    }
}
