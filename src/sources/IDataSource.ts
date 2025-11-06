import { Browser } from 'puppeteer';
import { LiveEvent, Sport } from '../common/commonTypes';

export interface IDataSource {
    name: string;
    fetchData(browser: Browser | null): Promise<{ liveEvents: LiveEvent[], sports: Sport[], [key: string]: any } | null>;
}