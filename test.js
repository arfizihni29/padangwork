const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    
    console.log("Testing Glints Pekanbaru...");
    const url = 'https://glints.com/id/opportunities/jobs/explore?keyword=admin&country=ID&locationId=79c660ef-ab9a-44e5-9f9d-623a766e5b72&locationName=Pekanbaru%2C+Riau&sortBy=LATEST';
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    // Simulate some scroll
    await page.evaluate(async () => {
        await new Promise(resolve => {
            let totalHeight = 0;
            const distance = 400;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= 2000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 150);
        });
    });
    
    const jobs = await page.evaluate(() => {
        let results = [];
        const links = document.querySelectorAll('a');
        for (let a of links) {
            const text = a.innerText.trim();
            const href = a.href;
            if (!href || !text) continue;
            if (!href.includes('/opportunities/jobs/') || href.includes('/explore')) continue;
            
            let card = a.closest('[class*="JobCard"]') || a.closest('[class*="job-card"]') || a.closest('[class*="Card"]') || a.closest('li');
            let rawContainerText = card ? card.innerText : '';
            let containerText = rawContainerText.toLowerCase();

            let isFresh = true;
            if (containerText) {
                if (containerText.match(/\d+\s*(bulan|month|tahun|year)/) ||
                    containerText.includes('30+ hari') || containerText.includes('30+d') ||
                    containerText.match(/[1-9]\d*\s*(minggu|week)/)) {
                    isFresh = false;
                } else {
                    let match = containerText.match(/(\d+)\s*(hari|day|d\s+ago|d ago)/);
                    if (match && parseInt(match[1]) > 5) {
                        isFresh = false;
                    }
                }
            }
            if (isFresh) {
                results.push({ 
                    title: text.split('\n')[0].trim(), 
                    link: href,
                    posted: rawContainerText.split('\n').find(l => /hari|day|jam|hour|menit|minute/i.test(l)) || 'Unknown'
                });
            }
        }
        return results;
    });
    
    console.log("Jobs found (max 5 hari):", jobs.length);
    console.log(jobs.slice(0, 3));
    await browser.close();
}
test();
