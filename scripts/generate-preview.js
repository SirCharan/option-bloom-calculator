import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePreview() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Set viewport to match social media preview dimensions
    await page.setViewport({
        width: 1200,
        height: 630
    });

    // Load the HTML file
    const htmlPath = path.join(__dirname, '../public/images/preview.html');
    await page.goto(`file:${htmlPath}`);

    // Take screenshot
    await page.screenshot({
        path: path.join(__dirname, '../public/images/preview.png'),
        type: 'png',
        fullPage: true
    });

    await browser.close();
    console.log('Preview image generated successfully!');
}

generatePreview().catch(console.error); 