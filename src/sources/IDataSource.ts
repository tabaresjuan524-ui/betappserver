import { Browser } from 'puppeteer';
import { CombinedData } from '../common/commonTypes';

export interface IDataSource {
    name: string;
    fetchData: (browser: Browser | null) => Promise<CombinedData | null>;
}