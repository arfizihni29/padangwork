const puppeteer = require('puppeteer');

async function test() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    
    console.log("Testing KitaLulus...");
    await page.goto('https://www.kitalulus.com/lowongan?sortBy=isHighlighted&location=Kota+Padang&gender=F', { waitUntil: 'networkidle2' });
    const klJobs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => {
            const container = a.parentElement && a.parentElement.parentElement ? a.parentElement.parentElement.innerText : '';
            return {
                href: a.href,
                text: a.innerText,
                containerText: container.replace(/\n/g, ' | ')
            };
        }).filter(item => item.href.includes('/lowongan/'));
    });
    console.log("KitaLulus Jobs found:", klJobs.length);
    console.log(klJobs.slice(0, 5));

    await browser.close();
}
test();
