const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

const FONNTE_TOKEN = 'v8422FEfwmCsbRhxHdw4';
const TARGET_NUMBER = process.env.FONNTE_TARGET || '08xxxxxxxxx'; // <-- Ganti dengan nomor tujuan Fonnte

const URLS = [
    'https://glints.com/id/opportunities/jobs/explore?keyword=admin&country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://glints.com/id/opportunities/jobs/explore?keyword=marketing&country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://glints.com/id/opportunities/jobs/explore?country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://id.jobstreet.com/id/jobs/in-Sumatera-Barat',
    'https://id.jobstreet.com/id/jobs/in-Sumatera-Barat?tags=new',
    'https://id.jobstreet.com/id/Admin-jobs/in-Sumatera-Barat?tags=new',
    'https://pintarnya.com/l-kota-padang-lowongan?sort=-published_at&search=&city_id=69&province_id=-1',
    'https://glints.com/id/opportunities/jobs/explore?country=ID&locationId=3c420344-8d9d-48a5-80e9-80e8a1617acd&locationName=Solok%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST'
];

async function sendFonnte(message) {
    if (TARGET_NUMBER === '08xxxxxxxxx' && !process.env.FONNTE_TARGET) {
        console.log("Nomor target Fonnte belum diset. Melewati pengiriman pesan...");
        return;
    }
    
    try {
        const response = await axios.post('https://api.fonnte.com/send', {
            target: TARGET_NUMBER,
            message: message,
            countryCode: '62'
        }, {
            headers: {
                'Authorization': FONNTE_TOKEN,
                'Content-Type': 'application/json'
            }
        });
        console.log('Fonnte Response:', response.data);
    } catch (error) {
        console.error('Error sending to Fonnte:', error.response ? error.response.data : error.message);
    }
}

function cleanUrl(url) {
    try {
        const u = new URL(url);
        u.search = '';
        u.hash = '';
        return u.toString();
    } catch (e) {
        return url;
    }
}

async function scrape() {
    const browser = await puppeteer.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

    let allJobs = [];

    for (let url of URLS) {
        console.log(`Scraping: ${url}`);
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            
            const jobs = await page.evaluate((currentUrl) => {
                const isGlints = currentUrl.includes('glints.com');
                const isPintarnya = currentUrl.includes('pintarnya.com');
                let results = [];
                const links = document.querySelectorAll('a');
                for (let a of links) {
                    const text = a.innerText.trim();
                    const href = a.href;
                    if (!href) continue;

                    // Get context text to find date
                    let rawContainerText = '';
                    if (isGlints) {
                        let card = a.closest('div[class*="JobCard"]');
                        if (card) rawContainerText = card.innerText;
                    } else if (isPintarnya) {
                        // Pintarnya uses simple divs or cards
                        let card = a.parentElement && a.parentElement.parentElement;
                        if (card) rawContainerText = card.innerText;
                    } else {
                        let article = a.closest('article');
                        if (article) rawContainerText = article.innerText;
                    }

                    if (!rawContainerText) {
                        rawContainerText = (a.parentElement && a.parentElement.parentElement) 
                            ? a.parentElement.parentElement.innerText
                            : '';
                    }

                    let containerText = rawContainerText.toLowerCase();

                    // Freshness filter: max 4 days old
                    let isFresh = true;
                    if (containerText) {
                        if (containerText.includes('bulan') || containerText.includes('month') || 
                            containerText.includes('tahun') || containerText.includes('year') ||
                            containerText.includes('minggu') || containerText.includes('week') ||
                            containerText.includes('30+ hari') || containerText.includes('30+d')) {
                            isFresh = false;
                        } else {
                            let match = containerText.match(/(\d+)\s*(hari|day|d\s+ago)/);
                            if (match && parseInt(match[1]) > 4) {
                                isFresh = false;
                            }
                        }
                    }

                    if (!isFresh) continue;
                    
                    // Filter out 'sales' jobs
                    if (containerText && containerText.includes('sales')) {
                        continue;
                    }
                    

                    // Extract salary
                    let salary = 'Gaji tidak ditampilkan';
                    if (rawContainerText) {
                        const lines = rawContainerText.split(/\n|\|/);
                        const salLine = lines.find(l => l.toUpperCase().includes('RP') || l.toUpperCase().includes('IDR'));
                        if (salLine) salary = salLine.trim();
                    }
                    
                    if (isGlints) {
                        if (href.includes('/opportunities/jobs/') && !href.includes('/explore')) {
                            results.push({ title: text.split('\n')[0], link: href, salary });
                        }
                    } else if (isPintarnya) {
                        if (href.includes('/lowongan/')) {
                            // pintarnya titles are sometimes separated by newline
                            results.push({ title: text.split('\n')[0], link: href, salary });
                        }
                    } else {
                        if (href.includes('/job/')) {
                             results.push({ title: text, link: href, salary });
                        }
                    }
                }
                return results;
            }, url);
            
            allJobs = allJobs.concat(jobs);
        } catch (e) {
            console.error(`Error scraping ${url}:`, e.message);
        }
    }

    await browser.close();

    const uniqueJobsMap = new Map();
    for (let job of allJobs) {
        const cUrl = cleanUrl(job.link);
        job.cleanLink = cUrl;
        
        if (!job.title || job.title.length < 4 || job.title.toLowerCase() === 'simpan' || job.title.toLowerCase() === 'save') {
            continue;
        }

        if (uniqueJobsMap.has(cUrl)) {
            const existing = uniqueJobsMap.get(cUrl);
            if (job.title.length > existing.title.length) {
                uniqueJobsMap.set(cUrl, job);
            }
        } else {
            uniqueJobsMap.set(cUrl, job);
        }
    }
    
    const uniqueJobs = Array.from(uniqueJobsMap.values());
    console.log(`Total unique jobs found: ${uniqueJobs.length}`);

    let sentJobs = [];
    if (fs.existsSync('sent_jobs.json')) {
        try {
            sentJobs = JSON.parse(fs.readFileSync('sent_jobs.json', 'utf-8'));
        } catch(e) {
            console.error("Error reading sent_jobs.json", e);
        }
    }

    const newJobs = uniqueJobs.filter(j => !sentJobs.includes(j.cleanLink));
    console.log(`New jobs to send: ${newJobs.length}`);

    if (newJobs.length > 0) {
        let message = `🚀 *SEMANGAT TERUS PEJUANG RUPIAH!* 🚀\n\nBerikut loker terbaru (super fresh) untuk area Padang, Solok, & Sumbar:\n\n`;
        let count = 0;
        
        for (let i = 0; i < newJobs.length; i++) {
            const job = newJobs[i];
            message += `🏢 *${i+1}. ${job.title}*\n💰 ${job.salary || 'Gaji tidak ditampilkan'}\n🔗 ${job.cleanLink}\n\n`;
            count++;
            
            // Fonnte limit batch size to avoid overly long messages, bumped to 40 per bubble to keep it in one chat bubble mostly
            if (count % 40 === 0 || i === newJobs.length - 1) {
                message += `_Jangan menyerah, rezeki nggak akan ketukar! Gas apply sekarang! 🔥_\n`;
                await sendFonnte(message);
                message = `🚀 *LOKER TERBARU (LANJUTAN)* 🚀\n\n`;
            }
        }
        
        newJobs.forEach(j => sentJobs.push(j.cleanLink));
        fs.writeFileSync('sent_jobs.json', JSON.stringify(sentJobs, null, 2));
        console.log("sent_jobs.json updated.");
    }
}

scrape().then(() => {
    console.log("Scraping completed.");
    process.exit(0);
});
