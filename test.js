const puppeteer = require('puppeteer');
async function test() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    
    await page.goto('https://id.jobstreet.com/id/jobs/in-Sumatera-Barat', { waitUntil: 'networkidle2' });
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/job/'))
            .map(a => ({ title: a.innerText, link: a.href }));
    });
    console.log("JobStreet Jobs:", links.slice(0,3));
    await browser.close();
}
test();
